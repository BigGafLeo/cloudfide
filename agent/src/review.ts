import { sourcePath } from "./value-plan.js";
import { selectContextFiles } from "./bundle.js";
import { Budget } from "./budget.js";
import { executeRole } from "./orchestrator.js";
import {
  reviewResultSchema,
  reviewManifestSchema,
  sameContext,
  limits,
  type CandidateManifest,
  type VerificationManifest,
  type ProviderAdapter,
  type ReviewManifest,
  type FileData,
  type TestPlan,
} from "./contracts.js";
import type { Policy } from "./config.js";
export class ReviewContextLimitError extends Error {
  constructor(bytes: number) {
    super(
      "review context bounds: " +
        bytes +
        " bytes exceeds " +
        limits.reviewBundle +
        " bytes",
    );
  }
}

/** Preserve complete review evidence and share the byte guard with round admission. */
export function buildReviewInput(
  candidate: CandidateManifest,
  verification: VerificationManifest,
  source: { patch: string; files: FileData[] },
) {
  const input = {
    context: candidate.context,
    plan: candidate.plan,
    patch: source.patch,
    files: source.files,
    checks: verification.checks,
    coverage: verification.candidateCoverage,
    facts: verification.facts,
    comparedTestOrigins: [
      ...new Set(
        candidate.plan!.cases.flatMap((c) =>
          c.value.existingTests.map((t) => t.path),
        ),
      ),
    ].map((path) => ({
      path,
      origin: source.files.some((f) => f.path === path)
        ? "original snapshot"
        : "candidate patch; absent from original snapshot",
    })),
  };
  const bytes = Buffer.byteLength(JSON.stringify(input));
  if (bytes > limits.reviewBundle) throw new ReviewContextLimitError(bytes);
  return input;
}

export async function runReview(
  candidate: CandidateManifest,
  verification: VerificationManifest,
  policy: Policy,
  adapters: Map<string, ProviderAdapter>,
  recheck: () => Promise<boolean>,
  signal: AbortSignal,
  source: { patch: string; files: FileData[] },
): Promise<ReviewManifest | null> {
  if (!policy.review.enabled) return null;
  if (
    !sameContext(candidate.context, verification.context) ||
    candidate.patch?.sha256 !== verification.patchSha256
  )
    throw new Error("review identity mismatch");
  const required = [
    "backend:unit",
    "backend:typecheck",
    "backend:coverage",
    "frontend:unit",
    "frontend:typecheck",
    "frontend:coverage",
  ];
  if (
    required.some(
      (id) =>
        !verification.checks.some((c) => c.id === id && c.status === "passed"),
    ) ||
    verification.checks.some(
      (c) => c.gate === "required" && c.status !== "passed",
    )
  )
    return null;
  const input = buildReviewInput(candidate, verification, source);
  const budget = new Budget(
    policy,
    Date.parse(candidate.context.deadline),
    candidate.calls,
    candidate.context.task === "coverage-gap"
      ? limits.coverageCalls
      : limits.calls,
  );
  const apps = (["backend", "frontend"] as const).filter((app) =>
    candidate.files.some((p) => p.startsWith(app + "/")),
  );
  let result;
  try {
    const output = await executeRole(
      "reviewer",
      candidate.context,
      input,
      apps,
      policy,
      adapters,
      budget,
      recheck,
      signal,
    );
    result = reviewResultSchema.parse(output.result);
  } catch (error) {
    result = {
      status: "inconclusive" as const,
      reason: error instanceof Error ? error.message : "review failed",
      findings: [],
    };
  }
  const call = budget.records().find((c) => c.role === "reviewer");
  if (!call) return null;
  const confirmations = result.findings.flatMap((f) =>
    verification.facts
      .filter(
        (fact) =>
          fact.id === f.factId &&
          fact.kind === f.kind &&
          fact.location === f.location,
      )
      .map((fact) => ({ findingId: f.id, factId: fact.id })),
  );
  return reviewManifestSchema.parse({
    context: candidate.context,
    patchSha256: candidate.patch!.sha256,
    producerJob: "reviewer",
    result,
    call,
    confirmations,
  });
}

/** Review new test paths through their planned units, rather than requiring them in the original tree. */
export function selectReviewFiles(
  files: FileData[],
  plan: TestPlan | null,
  proposed: FileData[] = [],
): FileData[] {
  if (!plan || plan.decision !== "write")
    throw new Error("review plan unavailable");
  const originals = new Map(files.map((file) => [file.path, file]));
  const byPath = new Map(
    [...files, ...proposed].map((file) => [file.path, file]),
  );
  const selected = new Set<string>(plan.paths);
  for (const testCase of plan.cases) {
    const path = sourcePath(testCase.sourceLocation);
    if (!originals.has(path))
      throw new Error("review source unavailable: " + path);
    selected.add(path);
    for (const existing of testCase.value.existingTests) {
      if (!byPath.has(existing.path))
        throw new Error("review existing test unavailable: " + existing.path);
      selected.add(existing.path);
    }
  }
  // Resolve imports using the actual proposal, but retain original tests for comparison.
  // Candidate-only full contents already appear in the exact patch.
  const originalContext = selectContextFiles(
    files,
    [...selected],
    [],
    "pr-change",
  );
  const proposedContext = selectContextFiles(
    [...byPath.values()],
    [...selected],
    [],
    "pr-change",
  );
  return [
    ...new Map(
      [...originalContext, ...proposedContext].map((file) => [file.path, file]),
    ).values(),
  ].flatMap((file) =>
    originals.has(file.path) ? [originals.get(file.path)!] : [],
  );
}
