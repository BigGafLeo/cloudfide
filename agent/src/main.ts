import { terminationScope } from "./termination.js";
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";
import {
  GitHubClient,
  resolveRun,
  eligible,
  recheckHead,
  publish,
} from "./github.js";
import { parsePolicy, type Policy } from "./config.js";
import { createAdapters } from "./providers/index.js";
import { fetchSnapshots } from "./source.js";
import { collectPrecollection } from "./precollect.js";
import { buildBundle, selectContextFiles } from "./bundle.js";
import { runCoverageRounds } from "./rounds.js";
import { runAgent } from "./orchestrator.js";
import { freezeCandidate, validateCandidatePatch } from "./candidate.js";
import { verifyCandidate } from "./verify.js";
import { runReview, selectReviewFiles } from "./review.js";
import { decide, renderReport } from "./report.js";
import { readArtifact } from "./artifacts.js";
import {
  terminalCandidate,
  validatePrecollection,
  runnerFor,
  assertWorkflowAuthentication,
} from "./controller.js";
import {
  candidatePayloadSchema,
  verificationPayloadSchema,
  reviewPayloadSchema,
  precollectionPayloadSchema,
  runContextSchema,
  sameContext,
  limits,
  type RunContext,
  type CandidatePayload,
  type VerificationPayload,
  type ReviewPayload,
} from "./contracts.js";
const root = process.cwd(),
  out = join(root, "output"),
  api = new GitHubClient();
const termination = terminationScope();
const signal = termination.signal;
try {
  const event = JSON.parse(
    await readFile(process.env.GITHUB_EVENT_PATH ?? "", "utf8"),
  );
  const policy: Policy = parsePolicy(
    JSON.parse(await readFile(join(root, "config.json"), "utf8")),
    ["codex", "claude"],
  );
  const phase = process.argv[2];
  await mkdir(out, { recursive: true });
  const context = await resolveRun(event, api, process.env.GITHUB_SHA ?? "");
  if (
    process.env.CONTEXT_JSON &&
    !sameContext(
      runContextSchema.parse(JSON.parse(process.env.CONTEXT_JSON)),
      context,
    )
  )
    throw new Error("captured context changed");
  const runUrl =
    "https://github.com/" +
    context.repository +
    "/actions/runs/" +
    context.executionRunId;
  const run = await api.request(
    "/repos/" + context.repository + "/actions/runs/" + context.executionRunId,
  );
  function name(kind: string) {
    return (
      "unit-agent-" +
      context.executionRunId +
      "-" +
      context.executionAttempt +
      "-" +
      kind
    );
  }
  async function output(key: string, value: string) {
    if (process.env.GITHUB_OUTPUT)
      await appendFile(process.env.GITHUB_OUTPUT, key + "=" + value + "\n");
  }
  async function payload(data: unknown) {
    const serialized = JSON.stringify(data);
    if (Buffer.byteLength(serialized) > limits.payload)
      throw new Error("payload bounds");
    await writeFile(join(out, "payload.json"), serialized);
  }
  async function download(
    kind: "precollect" | "agent" | "verifier" | "reviewer",
  ) {
    const id = Number(process.env["ARTIFACT_" + kind.toUpperCase()]);
    if (!Number.isSafeInteger(id) || id < 1)
      throw new Error("missing " + kind + " artifact from named producer");
    const metadata = await api.request(
      "/repos/" + context.repository + "/actions/artifacts/" + id,
    );
    const parsed = readArtifact(
      await api.archive(context.repository, id),
      {
        name: name(kind),
        producerJob: kind,
        artifactId: id,
        executionRunId: context.executionRunId,
        executionAttempt: context.executionAttempt,
        workflowId: run.workflow_id,
      },
      metadata,
      run,
    );
    if (!sameContext(parsed.manifest.context, context))
      throw new Error("artifact captured context mismatch");
    return parsed;
  }

  async function logArtifact(kind: "precollect" | "verifier") {
    const id = Number(process.env["ARTIFACT_" + kind.toUpperCase() + "_LOGS"]);
    if (!Number.isSafeInteger(id) || id < 1)
      throw new Error("missing raw " + kind + " evidence artifact");
    const metadata = await api.request(
      "/repos/" + context.repository + "/actions/artifacts/" + id,
    );
    if (
      metadata.id !== id ||
      metadata.name !== name(kind) + "-logs" ||
      String(metadata.workflow_run?.id) !== context.executionRunId ||
      metadata.workflow_run?.repository_id !== context.repositoryId ||
      metadata.workflow_run?.head_sha !== context.controlSha ||
      !Number.isSafeInteger(metadata.size_in_bytes) ||
      metadata.size_in_bytes > 20 * limits.log
    )
      throw new Error("raw evidence artifact identity/bounds");
    return { kind, id };
  }

  async function candidate() {
    const c = candidatePayloadSchema.parse(await download("agent"));
    if (c.patchText !== null)
      await writeFile(join(out, "candidate.patch"), c.patchText);
    return c;
  }
  if (phase === "resolve") {
    const allowed = await eligible(context, api, policy.trustedAuthors);
    if (allowed) await assertWorkflowAuthentication(context, policy, api);
    await output("context", JSON.stringify(context));
    await output("pr", String(context.pr));
    await output("eligible", String(allowed));
    await output("model-runner", JSON.stringify(runnerFor(policy)));
    await output("review-runner", JSON.stringify(runnerFor(policy, true)));
    await output("review-enabled", String(policy.review.enabled));
    await output("mutation-enabled", String(policy.mutation.enabled));
  } else if (phase === "precollect") {
    if (!(await eligible(context, api, policy.trustedAuthors)))
      throw new Error("untrusted precollection");
    const source = await fetchSnapshots(context, signal);
    try {
      const { base, head } = await collectPrecollection(
        source.base,
        source.head,
        context,
        out,
        signal,
      );
      await payload(
        precollectionPayloadSchema.parse({
          manifest: { context, producerJob: "precollect", base, head },
        }),
      );
    } finally {
      await source.cleanup();
    }
  } else if (phase === "agent") {
    let manifest = terminalCandidate(
        context,
        "inconclusive",
        "agent did not complete",
      ),
      patchText: string | null = null;
    try {
      if (!(await eligible(context, api, policy.trustedAuthors)))
        manifest = terminalCandidate(
          context,
          "skipped",
          "same-repository trusted author required",
        );
      else {
        await assertWorkflowAuthentication(context, policy, api);
        const evidence = validatePrecollection(
          await download("precollect"),
          context,
        );
        const source = await fetchSnapshots(context, signal);
        try {
          const files = selectContextFiles(
            source.files,
            source.changed,
            evidence.head.coverage.gaps,
            context.task,
          );
          for (const app of ["backend", "frontend"])
            if (files.some((f) => f.path.startsWith(app + "/"))) {
              for (const path of [
                app + "/package.json",
                app + "/vitest.config.ts",
                app + "/vite.config.ts",
                app + "/tests/setup.ts",
                app + "/src/test/setup.ts",
              ]) {
                const file = source.files.find((f) => f.path === path);
                if (file && !files.some((f) => f.path === path))
                  files.push(file);
              }
            }
          if (
            context.task === "pr-change" &&
            !source.changed.some((p) => /\.(ts|tsx)$/.test(p))
          )
            manifest = {
              ...terminalCandidate(
                context,
                "inconclusive",
                "no unit-relevant change",
              ),
              status: "no-change",
              plan: {
                decision: "no-change",
                reason: "No unit-relevant source/test change",
                cases: [],
                paths: [],
                remainingGaps: [],
              },
            };
          else if (context.task === "coverage-gap") {
            const result = await runCoverageRounds({
              context,
              source,
              evidence,
              policy,
              adapters: createAdapters(policy, root),
              recheck: () => recheckHead(context, api),
              signal,
              outputRoot: out,
            });
            manifest = result.manifest;
            patchText = result.patchText;
          } else {
            const bundle = buildBundle(
              context,
              evidence.head,
              files,
              source.diff,
            );
            bundle.evidence = { head: evidence.head, base: evidence.base };
            if (Buffer.byteLength(JSON.stringify(bundle)) > limits.bundle)
              bundle.missingCritical.push("complete bundle bounds");
            const result = await runAgent(
              context,
              bundle,
              policy,
              createAdapters(policy, root),
              () => recheckHead(context, api),
              signal,
            );
            manifest = {
              ...terminalCandidate(context, "inconclusive", result.reason),
              plan: result.plan,
              calls: result.calls,
              skillsUsed: result.skillsUsed,
              status: result.status,
            };
            if (result.writer && result.plan) {
              try {
                manifest = {
                  ...(await freezeCandidate(
                    context,
                    result.plan,
                    result.writer,
                    result.calls,
                    result.skillsUsed,
                    source.head,
                    out,
                  )),
                  reason: result.reason,
                };
                patchText = await readFile(
                  join(out, "candidate.patch"),
                  "utf8",
                );
              } catch (error) {
                manifest = {
                  ...manifest,
                  status: "inconclusive",
                  reason:
                    error instanceof Error
                      ? error.message
                      : "candidate rejected",
                };
              }
            }
          }
        } finally {
          await source.cleanup();
        }
      }
    } catch (error) {
      manifest = {
        ...manifest,
        status: "inconclusive",
        reason: error instanceof Error ? error.message : "agent failed",
      };
    }
    await payload(candidatePayloadSchema.parse({ manifest, patchText }));
    await output("candidate", String(manifest.status === "candidate"));
  } else if (phase === "verify") {
    const c = await candidate();
    if (c.manifest.status !== "candidate")
      throw new Error("no candidate to verify");
    if (!(await recheckHead(context, api))) throw new Error("stale PR");
    const source = await fetchSnapshots(context, signal);
    try {
      const manifest = await verifyCandidate(
        c.manifest,
        source.head,
        out,
        signal,
        { mutation: policy.mutation },
      );
      await payload(verificationPayloadSchema.parse({ manifest }));
    } finally {
      await source.cleanup();
    }
  } else if (phase === "review") {
    if (!(await eligible(context, api, policy.trustedAuthors)))
      throw new Error("same-repository trusted author required");
    await assertWorkflowAuthentication(context, policy, api);
    const c = await candidate();
    const v = verificationPayloadSchema.parse(await download("verifier"));
    const source = await fetchSnapshots(context, signal);
    try {
      const proposed = await validateCandidatePatch(
        c.patchText ?? "",
        c.manifest.files,
        source.head,
      );
      const files = selectReviewFiles(source.files, c.manifest.plan, proposed);
      const review = await runReview(
        c.manifest,
        v.manifest,
        policy,
        createAdapters(policy, root),
        () => recheckHead(context, api),
        signal,
        { patch: c.patchText ?? "", files },
      );
      if (review)
        await payload(reviewPayloadSchema.parse({ manifest: review }));
    } finally {
      await source.cleanup();
    }
  } else if (phase === "publish") {
    let c: CandidatePayload = {
        manifest: terminalCandidate(
          context,
          "inconclusive",
          "upstream output missing; checks were not completed",
        ),
        patchText: null,
      },
      v: VerificationPayload | null = null,
      r: ReviewPayload | null = null;
    const failures: string[] = [];
    const logArtifacts: { kind: "precollect" | "verifier"; id: number }[] = [];
    if (process.env.ARTIFACT_PRECOLLECT_LOGS)
      try {
        logArtifacts.push(await logArtifact("precollect"));
      } catch (error) {
        failures.push(
          error instanceof Error
            ? error.message
            : "raw precollect evidence unavailable",
        );
      }
    try {
      c = await candidate();
    } catch (error) {
      failures.push(
        error instanceof Error ? error.message : "candidate unavailable",
      );
    }
    if (!(await eligible(context, api, policy.trustedAuthors)))
      c = {
        manifest: terminalCandidate(
          context,
          "skipped",
          "same-repository trusted author required",
        ),
        patchText: null,
      };
    if (c.manifest.status === "candidate") {
      try {
        const verified = verificationPayloadSchema.parse(
          await download("verifier"),
        );
        logArtifacts.push(await logArtifact("verifier"));
        v = verified;
      } catch (error) {
        failures.push(
          error instanceof Error ? error.message : "verification unavailable",
        );
      }
      if (policy.review.enabled)
        try {
          r = reviewPayloadSchema.parse(await download("reviewer"));
        } catch (error) {
          failures.push(
            error instanceof Error ? error.message : "review unavailable",
          );
        }
    }
    const body =
      renderReport({
        candidate: c.manifest,
        verification: v?.manifest ?? null,
        review: r?.manifest ?? null,
        logArtifacts,
        decision: decide(
          c.manifest,
          v?.manifest ?? null,
          r?.manifest ?? null,
          policy,
        ),
        runUrl,
        policy,
      }) +
      (failures.length
        ? "\n\nMissing evidence: " +
          failures.map((s) => s.replace(/[<>@]/g, "")).join("; ")
        : "");
    await writeFile(join(out, "report.md"), body);
    if (process.env.GITHUB_STEP_SUMMARY)
      await appendFile(process.env.GITHUB_STEP_SUMMARY, body + "\n");
    if (signal.aborted) throw signal.reason;
    console.log("PR report: " + (await publish(context, body, api)));
  } else throw new Error("unknown phase");
} finally {
  termination.dispose();
}
