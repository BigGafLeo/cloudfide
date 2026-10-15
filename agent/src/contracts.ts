import { z } from "zod";
export const limits = {
  bundle: 200 * 1024,
  output: 256 * 1024,
  patch: 1024 * 1024,
  payload: 4 * 1024 * 1024,
  files: 20,
  calls: 3,
  coverageCalls: 17,
  rounds: 8,
  aggregateFiles: 160,
  aggregateCases: 160,
  roleMs: 30 * 60_000,
  runMs: 4 * 60 * 60_000,
  log: 10 * 1024 * 1024,
} as const;
const text = z.string().max(4096);
const nonempty = text.min(1);
const count = z.number().int().nonnegative().finite();
const id = z.string().regex(/^[1-9][0-9]*$/);
export const shaSchema = z.string().regex(/^[a-f0-9]{40}$/);
export const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const roleSchema = z.enum(["analyst", "writer", "reviewer"]);
export type Role = z.infer<typeof roleSchema>;
export const gateSchema = z.enum(["required", "advisory"]);
export type Gate = z.infer<typeof gateSchema>;
export type Decision =
  | "accepted"
  | "no-change"
  | "failed"
  | "inconclusive"
  | "skipped"
  | "error"
  | "cancelled";
export const statusSchema = z.enum([
  "passed",
  "failed",
  "inconclusive",
  "error",
  "skipped",
  "cancelled",
]);
export type CheckStatus = z.infer<typeof statusSchema>;
export const runContextSchema = z.strictObject({
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  repositoryId: count.positive(),
  pr: count.positive(),
  executionRunId: id,
  executionAttempt: count.positive(),
  trigger: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("dispatch") }),
    z.strictObject({
      kind: z.literal("workflow-run"),
      workflowId: count.positive(),
      runId: id,
      attempt: count.positive(),
    }),
  ]),
  baseSha: shaSchema,
  headSha: shaSchema,
  controlSha: shaSchema,
  task: z.enum(["pr-change", "coverage-gap"]),
  deadline: z.iso.datetime(),
});
export type RunContext = z.infer<typeof runContextSchema>;
export const caseSchema = z.strictObject({
  id: nonempty,
  sourceLocation: nonempty,
  behavior: nonempty,
  requirementSource: nonempty,
  inputs: nonempty,
  expected: nonempty,
  assertion: nonempty,
  mockBoundary: nonempty,
  confidence: z.enum(["contract-backed", "characterization", "unconfirmed"]),
});
export type Case = z.infer<typeof caseSchema>;
function planSchema(maxCases: number, maxPaths: number) {
  return z
    .strictObject({
      decision: z.enum(["write", "no-change", "inconclusive"]),
      reason: nonempty,
      cases: z.array(caseSchema).max(maxCases),
      paths: z.array(nonempty).max(maxPaths),
      remainingGaps: z.array(text).max(100),
    })
    .refine(
      (p) =>
        p.decision !== "write" || (p.cases.length > 0 && p.paths.length > 0),
      "write requires cases/paths",
    )
    .refine(
      (p) =>
        new Set(p.cases.map((c) => c.id)).size === p.cases.length &&
        new Set(p.paths).size === p.paths.length,
      "duplicate cases/paths",
    );
}
export const testPlanSchema = planSchema(20, 20);
export const aggregatedPlanSchema = planSchema(
  limits.aggregateCases,
  limits.aggregateFiles,
);
export type TestPlan = z.infer<typeof testPlanSchema>;
export const fileSchema = z.strictObject({
  path: nonempty,
  content: z
    .string()
    .refine((s) => Buffer.byteLength(s) <= limits.output, "file too large"),
});
export type FileData = z.infer<typeof fileSchema>;
export type TestFile = FileData;
export const writerResultSchema = z
  .strictObject({
    status: z.enum(["written", "dispute"]),
    reason: nonempty,
    files: z.array(fileSchema).max(limits.files),
    caseIds: z.array(nonempty).max(20),
  })
  .refine(
    (w) =>
      w.status !== "written" || (w.files.length > 0 && w.caseIds.length > 0),
    "written requires files and cases",
  )
  .refine(
    (w) =>
      new Set(w.files.map((f) => f.path)).size === w.files.length &&
      new Set(w.caseIds).size === w.caseIds.length,
    "duplicates",
  );
export type WriterResult = z.infer<typeof writerResultSchema>;
export const findingSchema = z.strictObject({
  id: nonempty,
  severity: z.enum(["material", "minor"]),
  location: nonempty,
  claim: nonempty,
  evidence: nonempty,
  kind: z.enum(["scope-violation", "oracle-counterexample", "other"]),
  factId: nonempty.nullable(),
});
export type Finding = z.infer<typeof findingSchema>;
export const reviewResultSchema = z.strictObject({
  status: z.enum(["passed", "failed", "inconclusive"]),
  reason: nonempty,
  findings: z.array(findingSchema).max(50),
});
export type ReviewResult = z.infer<typeof reviewResultSchema>;
export const usageSchema = z
  .strictObject({
    inputTokens: count,
    cachedInputTokens: count,
    outputTokens: count,
    estimatedUsd: z.number().finite().nonnegative().nullable(),
    raw: z.unknown(),
  })
  .refine(
    (u) => u.cachedInputTokens <= u.inputTokens,
    "cache exceeds total input",
  );
export type FinalUsage = z.infer<typeof usageSchema>;
export const callSchema = z.strictObject({
  callId: nonempty,
  role: roleSchema,
  provider: nonempty,
  model: nonempty,
  reservedEstimateUsd: z.number().finite().nonnegative(),
  usage: usageSchema.nullable(),
  elapsedMs: z.number().finite().nonnegative(),
  status: z.enum(["completed", "failed", "cancelled", "unknown"]),
});
export type CallRecord = z.infer<typeof callSchema>;
export interface RoleRequest {
  callId: string;
  role: Role;
  model: string;
  prompt: string;
  schema: object;
  timeoutMs: number;
  allocationUsd: number;
}
export interface NativeResult {
  result: unknown;
  usage: FinalUsage | null;
  diagnostics: string[];
  version: string;
  status: CallRecord["status"];
}
export interface ProviderAdapter {
  id: string;
  assertCapabilities(): Promise<void>;
  run(request: RoleRequest, signal: AbortSignal): Promise<NativeResult>;
}
export interface AnalysisBundle {
  context: RunContext;
  diff: string;
  files: FileData[];
  evidence: object;
  missingCritical: string[];
}
export const checkSchema = z.strictObject({
  id: nonempty,
  gate: gateSchema,
  status: statusSchema,
  reason: text,
  command: text,
  exitCode: z.number().int().nullable(),
  logPath: text,
});
export type CheckResult = z.infer<typeof checkSchema>;
const artifactRefSchema = z.strictObject({
  name: nonempty,
  sha256: hashSchema,
  bytes: count.max(limits.patch),
});
export type ArtifactRef = z.infer<typeof artifactRefSchema>;
export const candidateSchema = z
  .strictObject({
    context: runContextSchema,
    plan: aggregatedPlanSchema.nullable(),
    coverageRun: z.lazy(() => coverageRunSchema).optional(),
    patch: artifactRefSchema.nullable(),
    files: z.array(nonempty).max(limits.aggregateFiles),
    calls: z.array(callSchema).max(limits.coverageCalls),
    skillsUsed: z.array(nonempty).max(20),
    producerJob: z.literal("agent"),
    reason: text.optional(),
    status: z.enum([
      "candidate",
      "no-change",
      "inconclusive",
      "error",
      "skipped",
    ]),
  })
  .refine(
    (c) =>
      c.status === "candidate"
        ? c.patch !== null && c.files.length > 0 && c.plan?.decision === "write"
        : c.patch === null && c.files.length === 0,
    "candidate relation",
  )
  .refine(
    (c) => c.status !== "no-change" || c.plan?.decision === "no-change",
    "no-change needs plan",
  )
  .refine(
    (c) =>
      c.context.task !== "pr-change" ||
      (c.files.length <= limits.files &&
        c.calls.length <= limits.calls &&
        (c.plan?.cases.length ?? 0) <= 20 &&
        (c.plan?.paths.length ?? 0) <= 20),
    "scoped PR bounds",
  );
export type CandidateManifest = z.infer<typeof candidateSchema>;
const metricSchema = z
  .strictObject({
    covered: count,
    total: count,
    pct: z.number().finite().min(0).max(100),
  })
  .refine((m) => m.covered <= m.total, "covered exceeds total");
const metricsSchema = z.strictObject({
  lines: metricSchema,
  branches: metricSchema,
  statements: metricSchema,
  functions: metricSchema,
});
export type Metric = z.infer<typeof metricSchema>;
export type Metrics = z.infer<typeof metricsSchema>;
export const coverageSchema = z.strictObject({
  frontend: metricsSchema,
  backend: metricsSchema,
  gaps: z.array(text).max(1000),
});
export type CoverageReport = z.infer<typeof coverageSchema>;
const deltaMetric = z.strictObject({
  covered: z.number().finite(),
  total: z.number().finite(),
  pctPoints: z.number().finite(),
});
const deltas = z.strictObject({
  lines: deltaMetric,
  branches: deltaMetric,
  statements: deltaMetric,
  functions: deltaMetric,
});
export const comparisonSchema = z
  .strictObject({
    status: z.enum(["comparable", "not-comparable"]),
    reason: text,
    deltas: z.strictObject({ frontend: deltas, backend: deltas }).nullable(),
    objectiveMet: z.boolean(),
  })
  .refine(
    (c) => (c.status === "comparable" ? c.deltas !== null : c.deltas === null),
    "delta relation",
  );
export type CoverageComparison = z.infer<typeof comparisonSchema>;
export const coverageRunSchema = z.strictObject({
  initialCoverage: coverageSchema,
  stopReason: z.enum([
    "target-reached",
    "round-limit",
    "no-progress",
    "budget-exhausted",
    "stale",
    "cancelled",
    "deadline",
    "incomplete",
    "context-limit",
    "recheck-failed",
    "payload-limit",
  ]),
  rounds: z
    .array(
      z.strictObject({
        round: count.positive().max(limits.rounds),
        units: z.array(nonempty).max(8),
        status: z.enum(["accepted", "rejected", "no-change", "inconclusive"]),
        reason: text,
        plan: testPlanSchema.nullable(),
        checks: z.array(checkSchema).max(30),
        tests: z.lazy(() => collectedTestCountsSchema).optional(),
        coverage: coverageSchema.nullable(),
        callIds: z.array(nonempty).max(2),
      }),
    )
    .max(limits.rounds),
});
export type CoverageRun = z.infer<typeof coverageRunSchema>;
export const factSchema = z.strictObject({
  id: nonempty,
  kind: z.enum(["scope-violation", "oracle-counterexample"]),
  location: nonempty,
  evidenceRef: nonempty,
});
export type VerificationFact = z.infer<typeof factSchema>;
const collectedTestCountsSchema = z.strictObject({
  backend: z
    .strictObject({
      total: count.positive(),
      failed: count,
      failures: z.array(text).max(10),
    })
    .optional(),
  frontend: z
    .strictObject({
      total: count.positive(),
      failed: count,
      failures: z.array(text).max(10),
    })
    .optional(),
});
export const verificationSchema = z.strictObject({
  context: runContextSchema,
  patchSha256: hashSchema,
  producerJob: z.literal("verifier"),
  checks: z.array(checkSchema).max(30),
  originalCoverage: coverageSchema,
  candidateCoverage: coverageSchema,
  candidateTests: collectedTestCountsSchema.optional(),
  coverageComparison: comparisonSchema,
  facts: z.array(factSchema).max(50),
});
export type VerificationManifest = z.infer<typeof verificationSchema>;
export const reviewManifestSchema = z.strictObject({
  context: runContextSchema,
  patchSha256: hashSchema,
  producerJob: z.literal("reviewer"),
  result: reviewResultSchema,
  call: callSchema,
  confirmations: z
    .array(z.strictObject({ findingId: nonempty, factId: nonempty }))
    .max(50),
});
export type ReviewManifest = z.infer<typeof reviewManifestSchema>;
export const candidatePayloadSchema = z.strictObject({
  manifest: candidateSchema,
  patchText: z.string().nullable(),
});
export const verificationPayloadSchema = z.strictObject({
  manifest: verificationSchema,
});
export const reviewPayloadSchema = z.strictObject({
  manifest: reviewManifestSchema,
});
export type CandidatePayload = z.infer<typeof candidatePayloadSchema>;
export type VerificationPayload = z.infer<typeof verificationPayloadSchema>;
export type ReviewPayload = z.infer<typeof reviewPayloadSchema>;
export interface QualityCheck {
  id: string;
  run(workspace: string, signal: AbortSignal): Promise<CheckResult>;
}
export const roleOutputs = {
  analyst: testPlanSchema,
  writer: writerResultSchema,
  reviewer: reviewResultSchema,
};
export function sameContext(a: RunContext, b: RunContext): boolean {
  return (
    JSON.stringify(runContextSchema.parse(a)) ===
    JSON.stringify(runContextSchema.parse(b))
  );
}

export const collectedEvidenceSchema = z.strictObject({
  context: runContextSchema,
  checks: z.array(checkSchema).max(30),
  coverage: coverageSchema,
  complete: z.boolean(),
  comparisonReason: text,
  tests: z
    .strictObject({
      backend: z
        .strictObject({
          total: count.positive(),
          failed: count,
          failures: z.array(text).max(10),
        })
        .optional(),
      frontend: z
        .strictObject({
          total: count.positive(),
          failed: count,
          failures: z.array(text).max(10),
        })
        .optional(),
    })
    .optional(),
});
export const precollectionPayloadSchema = z.strictObject({
  manifest: z.strictObject({
    context: runContextSchema,
    producerJob: z.literal("precollect"),
    base: collectedEvidenceSchema,
    head: collectedEvidenceSchema,
  }),
});
export type PrecollectionPayload = z.infer<typeof precollectionPayloadSchema>;
