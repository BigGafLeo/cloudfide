import { coveragePolicy, defaultCoveragePolicy } from "./config.js";
import { coverageGoalMet, coverageDoesNotRegress } from "./coverage.js";
import {
  candidateSchema,
  verificationSchema,
  reviewManifestSchema,
  sameContext,
  type CandidateManifest,
  type VerificationManifest,
  type ReviewManifest,
  type Decision,
} from "./contracts.js";
import type { Policy } from "./config.js";
export function decide(
  input: CandidateManifest,
  evidence: VerificationManifest | null,
  review: ReviewManifest | null,
  policy: Policy,
): Decision {
  try {
    const c = candidateSchema.parse(input),
      v = evidence ? verificationSchema.parse(evidence) : null,
      r = review ? reviewManifestSchema.parse(review) : null;
    if (
      v &&
      (!sameContext(c.context, v.context) || v.patchSha256 !== c.patch?.sha256)
    )
      return "error";
    if (
      r &&
      (!sameContext(c.context, r.context) || r.patchSha256 !== c.patch?.sha256)
    )
      return "error";
    if (r)
      for (const confirmation of r.confirmations) {
        const finding = r.result.findings.find(
            (f) => f.id === confirmation.findingId,
          ),
          fact = v?.facts.find((f) => f.id === confirmation.factId);
        if (
          !finding ||
          !fact ||
          finding.factId !== fact.id ||
          finding.kind !== fact.kind ||
          finding.location !== fact.location
        )
          return "error";
      }
    if (c.status !== "candidate")
      return c.status === "no-change" ? "no-change" : c.status;
    if (!v) return "inconclusive";
    if (new Set(v.checks.map((x) => x.id)).size !== v.checks.length)
      return "error";
    const required = [
      "backend:unit",
      "backend:typecheck",
      "backend:coverage",
      "frontend:unit",
      "frontend:typecheck",
      "frontend:coverage",
    ];
    if (policy.mutation.enabled && policy.mutation.gate === "required")
      required.push("mutation");
    if (v.facts.length) return "failed";
    if (
      v.checks.some(
        (check) => check.gate === "required" && check.status === "failed",
      )
    )
      return "failed";
    if (
      required.some(
        (id) =>
          !v.checks.some(
            (check) =>
              check.id === id &&
              check.gate === "required" &&
              check.status === "passed",
          ),
      ) ||
      v.checks.some(
        (check) => check.gate === "required" && check.status !== "passed",
      )
    )
      return "inconclusive";
    if (v.coverageComparison.status !== "comparable") return "inconclusive";
    if (!coverageDoesNotRegress(v.originalCoverage, v.candidateCoverage))
      return "failed";
    if (policy.review.enabled && policy.review.gate === "required") {
      if (
        !r ||
        r.result.status !== "passed" ||
        r.result.findings.some(
          (f) =>
            f.severity === "material" || f.kind === "oracle-counterexample",
        )
      )
        return "inconclusive";
    }
    return "accepted";
  } catch {
    return "error";
  }
}
export function plain(text: string): string {
  return text
    .slice(0, 4096)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/([\\\[\]()*_`!#|])/g, "\\$1")
    .replaceAll("@", "＠");
}
export function renderReport(input: {
  candidate: CandidateManifest;
  verification: VerificationManifest | null;
  review: ReviewManifest | null;
  decision: Decision;
  runUrl: string;
  policy?: Policy;
  logArtifacts?: { kind: "precollect" | "verifier"; id: number }[];
}): string {
  const { candidate: c, verification: v, review: r, decision } = input;
  const url =
    "https://github.com/" +
    c.context.repository +
    "/actions/runs/" +
    c.context.executionRunId;
  if (input.runUrl !== url) throw new Error("untrusted run URL");
  const coverage = input.policy
    ? coveragePolicy(input.policy)
    : defaultCoveragePolicy;
  const target = coverage.target;
  const reached = Boolean(
    v &&
    input.policy &&
    // Measured coverage is independent of the required semantic-review decision.
    decide(c, v, null, {
      ...input.policy,
      review: { enabled: false, gate: "advisory" },
    }) === "accepted" &&
    v.coverageComparison.status === "comparable" &&
    coverageDoesNotRegress(v.originalCoverage, v.candidateCoverage) &&
    coverageGoalMet(v.candidateCoverage, target),
  );
  const rows = [
    "<!-- cloudfide-unit-agent -->",
    "<!-- execution:" +
      c.context.executionRunId +
      ":" +
      c.context.executionAttempt +
      " -->",
    "## Unit-test agent" +
      (c.context.task === "coverage-gap"
        ? " proposal: " +
          decision +
          "; coverage run: " +
          (reached ? "reached" : "partial")
        : ": " + decision),
    "Tested head: " + c.context.headSha,
    "Control revision: " + c.context.controlSha,
    "[Run and artifacts](" + url + ")",
    "",
    plain(
      c.reason ??
        c.plan?.reason ??
        "No complete agent plan; see workflow logs.",
    ),
    "",
    "Skills: " + (c.skillsUsed.map(plain).join(", ") || "none"),
    "",
  ];
  for (const log of input.logArtifacts ?? []) {
    if (!Number.isSafeInteger(log.id) || log.id < 1)
      throw new Error("invalid evidence link");
    rows.push(
      "[" +
        log.kind +
        " raw execution logs](" +
        url +
        "/artifacts/" +
        log.id +
        ")",
    );
  }
  if (c.context.task === "coverage-gap") {
    rows.push(
      "",
      "Coverage milestone: " +
        (reached ? "reached" : "partial") +
        ". Each app requires lines >= " +
        target.lines +
        "% and branches >= " +
        target.branches +
        "%; only the final verifier establishes measured attainment.",
      coverage.stopAtTarget
        ? "Coverage stopping policy: stop at the coverage milestone."
        : "Coverage stopping policy: bounded continuation after the coverage milestone; useful justified tests may continue within round, no-progress, call, budget and deadline limits.",
    );
    if (c.coverageRun) {
      rows.push(
        "Controller stop reason: " + c.coverageRun.stopReason,
        "Shared model calls: " + (c.calls.length + (r ? 1 : 0)),
        "",
        "| Measurement | Status | Backend lines / branches | Frontend lines / branches |",
        "|---|---|---|---|",
      );
      const initial = c.coverageRun.initialCoverage;
      rows.push(
        "| initial | trusted precollection | " +
          initial.backend.lines.pct +
          "% / " +
          initial.backend.branches.pct +
          "% | " +
          initial.frontend.lines.pct +
          "% / " +
          initial.frontend.branches.pct +
          "% |",
      );
      for (const round of c.coverageRun.rounds) {
        const cv = round.coverage;
        rows.push(
          "| round " +
            round.round +
            " | " +
            round.status +
            ": " +
            plain(round.reason) +
            " | " +
            (cv
              ? cv.backend.lines.pct + "% / " + cv.backend.branches.pct + "%"
              : "unavailable") +
            " | " +
            (cv
              ? cv.frontend.lines.pct + "% / " + cv.frontend.branches.pct + "%"
              : "unavailable") +
            " |",
        );
      }
    }
  }
  if (c.patch)
    rows.push(
      "Candidate: payload.json contains patchText (sha256 " +
        c.patch.sha256 +
        "). No branch push.",
      "",
    );
  if (v) {
    rows.push("| Check | Result | Command |", "|---|---|---|");
    for (const check of v.checks)
      rows.push(
        "| " +
          plain(check.id) +
          " | " +
          check.status +
          " " +
          plain(check.reason) +
          " | " +
          plain(check.command) +
          " |",
      );
    rows.push("", "| App / metric | Original | Candidate |", "|---|---|---|");
    for (const app of ["backend", "frontend"] as const)
      for (const metric of [
        "lines",
        "branches",
        "statements",
        "functions",
      ] as const) {
        const before = v.originalCoverage[app][metric],
          after = v.candidateCoverage[app][metric];
        rows.push(
          "| " +
            app +
            "/" +
            metric +
            " | " +
            before.covered +
            "/" +
            before.total +
            " (" +
            before.pct +
            "%) | " +
            after.covered +
            "/" +
            after.total +
            " (" +
            after.pct +
            "%) |",
        );
      }
    rows.push(
      "",
      "Coverage comparison: " +
        v.coverageComparison.status +
        " — " +
        plain(v.coverageComparison.reason),
      "100% objective met: " +
        v.coverageComparison.objectiveMet +
        ". This is measured coverage, not proof of semantic completeness.",
    );
  }
  rows.push(
    "",
    "Review: " + (r ? r.result.status : "skipped/disabled or unavailable"),
  );
  if (
    input.policy?.review.enabled &&
    input.policy.review.gate === "required" &&
    r?.result.findings.some(
      (finding) => finding.kind === "oracle-counterexample",
    )
  )
    rows.push(
      "Required review gate: oracle-counterexample findings block acceptance regardless of severity; unconfirmed reviewer claims require resolution.",
    );
  if (r)
    for (const f of r.result.findings)
      rows.push(
        "- " +
          plain(f.location) +
          ": " +
          plain(f.claim) +
          " — " +
          plain(f.evidence) +
          " (" +
          (r.confirmations.some((x) => x.findingId === f.id)
            ? "host-confirmed"
            : "unconfirmed") +
          ")",
      );
  rows.push("", "Remaining gaps:");
  for (const gap of c.plan?.remainingGaps ?? ["analysis incomplete"])
    rows.push("- " + plain(gap));
  rows.push("", "Cost (estimates, not invoice):");
  for (const call of [...c.calls, ...(r ? [r.call] : [])])
    rows.push(
      "- " +
        call.role +
        " / " +
        plain(call.provider) +
        " / " +
        plain(call.model) +
        ": " +
        (call.usage?.estimatedUsd === null || !call.usage
          ? "unknown, reservation " +
            call.reservedEstimateUsd +
            (input.policy?.roles[call.role]?.auth === "subscription"
              ? " virtual units retained (not a bill or quota)"
              : " USD retained")
          : call.usage.estimatedUsd + " USD estimated") +
        "; " +
        call.elapsedMs +
        " ms; " +
        call.status,
    );
  if (c.plan?.cases.length) {
    rows.push(
      "",
      "Planned test value (analyst rationale for independent review, not a measured risk score):",
      "| Case / action | Target / compared tests | Distinct regression | Impact and maintenance cost |",
      "|---|---|---|---|",
    );
    for (const testCase of c.plan.cases.slice(0, 20)) {
      const value = testCase.value;
      const compared =
        value.existingTests
          .map((test) => test.path + " :: " + test.name)
          .join("; ") || "none identified in supplied scope";
      rows.push(
        "| " +
          plain(testCase.id).slice(0, 100) +
          " / " +
          value.action +
          " | " +
          plain(value.testPath + "; " + compared).slice(0, 400) +
          " | " +
          plain(value.regression).slice(0, 400) +
          " | " +
          plain(value.rationale).slice(0, 400) +
          " |",
      );
    }
    rows.push(
      "Full value plans, including any additional cases, are retained in payload.json. Coverage and case counts do not establish minimality or correctness.",
    );
  }
  return rows.join("\n").slice(0, 40000);
}
