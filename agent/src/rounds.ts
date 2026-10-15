import { HostStopError } from "./termination.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Budget } from "./budget.js";
import {
  buildBundle,
  selectContextFiles,
  selectCoverageUnits,
} from "./bundle.js";
import { freezeCandidate } from "./candidate.js";
import { coveragePolicy, type Policy } from "./config.js";
import {
  coverageGoalMet,
  coverageDoesNotRegress,
  coverageIncreased,
  sameCoverageMeasurement,
} from "./coverage.js";
import {
  candidatePayloadSchema,
  verificationSchema,
  limits,
  sameContext,
  type CandidatePayload,
  type CoverageRun,
  type FileData,
  type ProviderAdapter,
  type RunContext,
  type TestPlan,
} from "./contracts.js";
import { terminalCandidate } from "./controller.js";
import { runAgent } from "./orchestrator.js";
import type { CollectedEvidence } from "./precollect.js";
import { decide } from "./report.js";
import { verifyCandidate } from "./verify.js";

export interface CoverageRoundsOptions {
  context: RunContext;
  source: { head: string; files: FileData[]; changed: string[]; diff: string };
  evidence: { head: CollectedEvidence; base: CollectedEvidence };
  policy: Policy;
  adapters: Map<string, ProviderAdapter>;
  recheck: () => Promise<boolean>;
  signal: AbortSignal;
  outputRoot: string;
  /** Test seam for the expensive Docker boundary; production uses verifyCandidate. */
  verify?: typeof verifyCandidate;
}
export async function runCoverageRounds(
  options: CoverageRoundsOptions,
): Promise<CandidatePayload> {
  const {
    context,
    source,
    evidence,
    policy,
    adapters,
    recheck,
    signal,
    outputRoot,
  } = options;
  if (context.task !== "coverage-gap")
    throw new Error("coverage rounds require coverage-gap");
  const settings = coveragePolicy(policy);
  const budget = new Budget(
    policy,
    Date.parse(context.deadline),
    [],
    limits.coverageCalls,
  );
  const history: CoverageRun["rounds"] = [],
    skills = new Set<string>(),
    attempted: string[] = [];
  const contents = new Map<string, FileData>();
  const attemptedPatches = new Set<string>();
  let current = structuredClone(evidence.head),
    noProgress = 0;
  if (
    coverageGoalMet(current.coverage, settings.target) &&
    (["backend", "frontend"].some((app) =>
      ["unit", "typecheck", "coverage"].some(
        (kind) =>
          !current.checks.some(
            (check) =>
              check.id === app + ":" + kind &&
              check.gate === "required" &&
              check.status === "passed",
          ),
      ),
    ) ||
      current.checks.some(
        (check) => check.gate === "required" && check.status !== "passed",
      ))
  )
    current.complete = false;
  let accepted: CandidatePayload | null = null;
  let aggregate: TestPlan = {
    decision: "write",
    reason: "Verified cumulative coverage batches",
    cases: [],
    paths: [],
    remainingGaps: [],
  };
  let stopReason: CoverageRun["stopReason"] = "round-limit";
  let hostFailureReason = "";
  function snapshot(
    proposal: CandidatePayload | null = accepted,
  ): CandidatePayload {
    const manifest = {
      ...(proposal?.manifest ??
        terminalCandidate(
          context,
          "inconclusive",
          "No verified coverage batch",
        )),
      calls: budget.records(),
      skillsUsed: [...skills],
      coverageRun: {
        initialCoverage: evidence.head.coverage,
        rounds: history,
        stopReason,
      },
      reason:
        "Coverage run stopped: " +
        stopReason +
        (hostFailureReason ? ": " + hostFailureReason : ""),
    };
    if (!proposal && stopReason === "target-reached") {
      manifest.status = "no-change";
      manifest.plan = {
        decision: "no-change",
        reason: "Trusted initial measurement already meets coverage target",
        cases: [],
        paths: [],
        remainingGaps: current.coverage.gaps.slice(0, 100),
      };
    }
    return { manifest, patchText: proposal?.patchText ?? null };
  }
  const payloadBytes = (value: CandidatePayload) =>
    Buffer.byteLength(JSON.stringify(value));
  // Reserve the next patch, duplicated bounded role plans, usage and evidence before any new model call.
  const payloadHeadroom = limits.patch + 3 * limits.output + limits.bundle;
  async function interruption(): Promise<CoverageRun["stopReason"] | null> {
    if (signal.aborted) return "cancelled";
    if (Date.now() >= Date.parse(context.deadline)) return "deadline";
    try {
      if (!(await recheck())) return "stale";
    } catch (error) {
      hostFailureReason = (
        error instanceof Error ? error.message : "head check failed"
      ).slice(0, 1024);
      return "recheck-failed";
    }
    return signal.aborted ? "cancelled" : null;
  }
  for (let round = 1; round <= settings.maxRounds; round++) {
    const interrupted = await interruption();
    if (interrupted) {
      stopReason = interrupted;
      break;
    }
    if (!current.complete) {
      stopReason = "incomplete";
      break;
    }
    if (coverageGoalMet(current.coverage, settings.target)) {
      stopReason = "target-reached";
      break;
    }
    if (payloadBytes(snapshot()) + payloadHeadroom > limits.payload) {
      stopReason = "payload-limit";
      break;
    }
    const allFiles = new Map(source.files.map((f) => [f.path, f]));
    for (const [path, file] of contents) allFiles.set(path, file);
    const units = selectCoverageUnits(
      [...allFiles.values()],
      current.coverage.gaps,
      attempted,
    );
    attempted.push(...units);
    const selected = selectContextFiles(
      [...allFiles.values()],
      [],
      current.coverage.gaps,
      "coverage-gap",
      attempted.slice(0, -units.length),
    );
    for (const file of contents.values())
      if (!selected.some((f) => f.path === file.path)) selected.push(file);
    for (const app of ["backend", "frontend"])
      for (const path of [
        app + "/package.json",
        app + "/vitest.config.ts",
        app + "/vite.config.ts",
        app + "/tests/setup.ts",
        app + "/src/test/setup.ts",
      ]) {
        const file = allFiles.get(path);
        if (file && !selected.some((f) => f.path === path)) selected.push(file);
      }
    const bundle = buildBundle(context, current, selected, source.diff);
    bundle.evidence = {
      head: current,
      base: evidence.base,
      history: history.map(
        ({ round, units, status, reason, checks, tests }) => ({
          round,
          units,
          status,
          reason,
          checks,
          tests,
        }),
      ),
      target: settings.target,
    };
    if (Buffer.byteLength(JSON.stringify(bundle)) > limits.bundle)
      bundle.missingCritical.push("complete bundle bounds");
    if (bundle.missingCritical.length) {
      stopReason = "context-limit";
      break;
    }
    const beforeCalls = budget.records().length;
    const result = await runAgent(
      context,
      bundle,
      policy,
      adapters,
      recheck,
      signal,
      budget,
    );
    result.skillsUsed.forEach((s) => skills.add(s));
    const record: CoverageRun["rounds"][number] = {
      round,
      units,
      status: "inconclusive",
      reason: result.reason.slice(0, 4096),
      plan: result.plan,
      checks: [],
      coverage: null,
      callIds: budget
        .records()
        .slice(beforeCalls)
        .map((c) => c.callId),
    };
    history.push(record);
    let progressed = false;
    let batchStop: CoverageRun["stopReason"] | null = null;
    if (result.writer && result.plan) {
      try {
        if (
          result.writer.caseIds.some(
            (id) => !result.plan!.cases.some((c) => c.id === id),
          ) ||
          result.plan.cases.some(
            (c) => !result.writer!.caseIds.includes(c.id),
          ) ||
          result.writer.files.some(
            (file) => !result.plan!.paths.includes(file.path),
          )
        )
          throw new Error("batch writer does not match current plan");
        const trialContents = new Map(contents);
        for (const file of result.writer.files)
          trialContents.set(file.path, file);
        const trialPlan: TestPlan = {
          decision: "write",
          reason: "Verified cumulative coverage batches",
          cases: [
            ...aggregate.cases,
            ...result.plan.cases.map((c) => ({
              ...c,
              id: "round-" + round + ":" + c.id,
            })),
          ],
          paths: [...new Set([...aggregate.paths, ...result.plan.paths])],
          remainingGaps: result.plan.remainingGaps,
        };
        const roundOut = join(outputRoot, "round-" + round);
        const manifest = await freezeCandidate(
          context,
          trialPlan,
          {
            status: "written",
            reason: result.writer.reason,
            files: [...trialContents.values()],
            caseIds: trialPlan.cases.map((c) => c.id),
          },
          budget.records(),
          [...skills],
          source.head,
          roundOut,
          { aggregate: true },
        );
        if (attemptedPatches.has(manifest.patch!.sha256))
          throw new Error("identical candidate patch already attempted");
        attemptedPatches.add(manifest.patch!.sha256);
        const interrupted = await interruption();
        if (interrupted) {
          stopReason = interrupted;
          break;
        }
        const verification = verificationSchema.parse(
          await (options.verify ?? verifyCandidate)(
            manifest,
            source.head,
            roundOut,
            signal,
          ),
        );
        record.checks = verification.checks;
        record.tests = verification.candidateTests;
        record.coverage = verification.candidateCoverage;
        if (
          !sameContext(context, verification.context) ||
          verification.patchSha256 !== manifest.patch!.sha256
        )
          throw new Error("verification identity mismatch");
        if (
          !sameCoverageMeasurement(
            evidence.head.coverage,
            verification.originalCoverage,
          )
        )
          throw new Error("original measurement changed");
        if (verification.coverageComparison.status !== "comparable")
          throw new Error("coverage not comparable");
        if (
          !coverageDoesNotRegress(
            current.coverage,
            verification.candidateCoverage,
          )
        )
          throw new Error("coverage regression or changed denominators");
        if (
          decide(manifest, verification, null, {
            ...policy,
            review: { enabled: false, gate: "advisory" },
            mutation: { enabled: false, gate: "advisory" },
          }) !== "accepted"
        )
          throw new Error("required candidate checks did not pass");
        progressed = coverageIncreased(
          current.coverage,
          verification.candidateCoverage,
        );
        const patchText = await readFile(
          join(roundOut, "candidate.patch"),
          "utf8",
        );
        const trial = { manifest, patchText };
        if (payloadBytes(snapshot(trial)) > limits.payload - limits.output)
          throw new HostStopError(
            "payload-limit",
            "trial payload exceeds reserved artifact capacity",
          );
        accepted = trial;
        contents.clear();
        for (const [path, file] of trialContents) contents.set(path, file);
        aggregate = trialPlan;
        current = {
          ...current,
          coverage: verification.candidateCoverage,
          checks: verification.checks,
          complete: true,
          ...(verification.candidateTests
            ? { tests: verification.candidateTests }
            : {}),
        };
        record.status = "accepted";
        record.reason = progressed
          ? "verified coverage increased"
          : "verified assertions retained; no coverage increase";
      } catch (error) {
        if (
          (error instanceof HostStopError && error.code === "payload-limit") ||
          payloadBytes(snapshot()) > limits.payload - limits.output
        ) {
          batchStop = "payload-limit";
          // Full verifier details remain in the round directory; retain all model plans and call records inline.
          record.coverage = null;
          record.checks = [];
          delete record.tests;
        }
        record.status = "rejected";
        record.reason = (
          error instanceof Error ? error.message : "candidate rejected"
        ).slice(0, 4096);
        if (batchStop === "payload-limit")
          record.reason =
            "payload limit; detailed evidence retained in round-" +
            round +
            "/verification.json";
      }
    } else if (result.status === "no-change") record.status = "no-change";
    noProgress = progressed ? 0 : noProgress + 1;
    if (result.hostStop || batchStop) {
      stopReason = result.hostStop ?? batchStop!;
      hostFailureReason = result.hostStop ? result.reason.slice(0, 1024) : "";
      break;
    }
    const interruptedAfter = await interruption();
    if (interruptedAfter) {
      stopReason = interruptedAfter;
      break;
    }

    if (coverageGoalMet(current.coverage, settings.target)) {
      stopReason = "target-reached";
      break;
    }
    if (noProgress >= settings.noProgressRounds) {
      stopReason = "no-progress";
      break;
    }
  }
  const payload = candidatePayloadSchema.parse(snapshot());
  if (Buffer.byteLength(JSON.stringify(payload)) > limits.payload)
    throw new Error("payload bounds");
  await mkdir(outputRoot, { recursive: true });
  if (payload.patchText !== null)
    await writeFile(join(outputRoot, "candidate.patch"), payload.patchText);
  return payload;
}
