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
} from "./contracts.js";
import type { Policy } from "./config.js";
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
  const input = {
    context: candidate.context,
    plan: candidate.plan,
    patch: source.patch,
    files: source.files,
    checks: verification.checks,
    coverage: verification.candidateCoverage,
    facts: verification.facts,
  };
  if (Buffer.byteLength(JSON.stringify(input)) > limits.bundle)
    throw new Error("review context bounds");
  const budget = new Budget(
    policy,
    Date.parse(candidate.context.deadline),
    candidate.calls,
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
