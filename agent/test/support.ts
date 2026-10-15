import { limits } from "../src/contracts.js";
import type {
  RunContext,
  TestPlan,
  CandidateManifest,
  VerificationManifest,
  ReviewManifest,
  CoverageReport,
  NativeResult,
} from "../src/contracts.js";
import type { Policy } from "../src/config.js";
export function makeContext(): RunContext {
  return {
    repository: "owner/repo",
    repositoryId: 1,
    pr: 2,
    executionRunId: "123",
    executionAttempt: 1,
    trigger: { kind: "dispatch" },
    baseSha: "a".repeat(40),
    headSha: "b".repeat(40),
    controlSha: "c".repeat(40),
    task: "pr-change",
    deadline: new Date(Date.now() + limits.runMs).toISOString(),
  };
}
export function makePlan(): TestPlan {
  return {
    decision: "write",
    reason: "HTTP 204 contract",
    cases: [
      {
        id: "case-1",
        sourceLocation: "frontend/src/lib/http.ts:1",
        behavior: "204 has no body",
        requirementSource: "HTTP 204 contract",
        inputs: "204 response",
        expected: "undefined; no JSON read",
        assertion: "real request returns undefined",
        mockBoundary: "fetch only",
        confidence: "contract-backed",
      },
    ],
    paths: ["frontend/src/lib/http.test.ts"],
    remainingGaps: ["other HTTP errors"],
  };
}
export function makeCoverage(): CoverageReport {
  const m = {
    lines: { covered: 5, total: 10, pct: 50 },
    branches: { covered: 2, total: 8, pct: 25 },
    functions: { covered: 1, total: 2, pct: 50 },
    statements: { covered: 5, total: 10, pct: 50 },
  };
  return {
    frontend: structuredClone(m),
    backend: structuredClone(m),
    gaps: ["http.ts:3"],
  };
}
export function makeCandidate(): CandidateManifest {
  return {
    context: makeContext(),
    plan: makePlan(),
    patch: { name: "candidate.patch", sha256: "d".repeat(64), bytes: 5 },
    files: ["frontend/src/lib/http.test.ts"],
    calls: [],
    skillsUsed: ["write-unit-tests"],
    producerJob: "agent",
    status: "candidate",
  };
}
export function makeVerification(c = makeCandidate()): VerificationManifest {
  return {
    context: c.context,
    patchSha256: c.patch!.sha256,
    producerJob: "verifier",
    checks: ["backend", "frontend"].flatMap((app) =>
      ["unit", "typecheck", "coverage"].map((kind) => ({
        id: app + ":" + kind,
        gate: "required" as const,
        status: "passed" as const,
        reason: "",
        command: "fixture",
        exitCode: 0,
        logPath: "fixture.log",
      })),
    ),
    originalCoverage: makeCoverage(),
    candidateCoverage: makeCoverage(),
    coverageComparison: {
      status: "not-comparable",
      reason: "fixture",
      deltas: null,
      objectiveMet: false,
    },
    facts: [],
  };
}
export function activePolicy(): Policy {
  const role = {
    provider: "fixture",
    model: "test",
    allocationUsd: 1,
    pricingSource: "fixture",
    pricingDate: "2026-10-14",
  };
  return {
    trustedAuthors: ["karol"],
    roles: { analyst: { ...role }, writer: { ...role }, reviewer: { ...role } },
    maxEstimatedUsd: 3,
    review: { enabled: false, gate: "advisory" },
    mutation: { enabled: false, gate: "advisory" },
  };
}
export function completedNative(cost = 0.25): NativeResult {
  return {
    result: {},
    usage: {
      inputTokens: 4,
      cachedInputTokens: 0,
      outputTokens: 2,
      estimatedUsd: cost,
      raw: {},
    },
    status: "completed",
    diagnostics: [],
    version: "fixture",
  };
}
export function makeReview(c = makeCandidate()): ReviewManifest {
  return {
    context: c.context,
    patchSha256: c.patch!.sha256,
    producerJob: "reviewer",
    result: { status: "passed", reason: "checked", findings: [] },
    call: {
      callId: "review",
      role: "reviewer",
      provider: "fixture",
      model: "test",
      reservedEstimateUsd: 1,
      usage: null,
      elapsedMs: 1,
      status: "completed",
    },
    confirmations: [],
  };
}
