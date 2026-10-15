import { candidateSchema } from "../src/contracts.js";
import { makeCandidate, makePlan } from "./support.js";
import { expect, it } from "vitest";
import {
  runContextSchema,
  testPlanSchema,
  writerResultSchema,
  reviewResultSchema,
  usageSchema,
} from "../src/contracts.js";
import { parsePolicy } from "../src/config.js";
it("accepts valid context but rejects merged source and execution identities", () => {
  const context = {
    repository: "owner/repo",
    repositoryId: 1,
    pr: 2,
    executionRunId: "123",
    executionAttempt: 1,
    trigger: { kind: "workflow-run", workflowId: 3, runId: "122", attempt: 2 },
    baseSha: "a".repeat(40),
    headSha: "b".repeat(40),
    controlSha: "c".repeat(40),
    task: "pr-change",
    deadline: "2026-10-14T12:00:00.000Z",
  };
  expect(runContextSchema.parse(context).trigger.kind).toBe("workflow-run");
  expect(() =>
    runContextSchema.parse({ ...context, executionAttempt: 0 }),
  ).toThrow();
  expect(() => runContextSchema.parse({ ...context, runId: "122" })).toThrow();
});
it("rejects missing candidate files, unknown authority and invalid cached usage", () => {
  expect(() =>
    writerResultSchema.parse({
      status: "written",
      reason: "ok",
      files: [],
      caseIds: ["one"],
    }),
  ).toThrow();
  expect(() =>
    testPlanSchema.parse({
      decision: "no-change",
      reason: "complete",
      cases: [],
      paths: [],
      remainingGaps: [],
      command: "evil",
    }),
  ).toThrow();
  expect(() =>
    reviewResultSchema.parse({
      status: "passed",
      reason: "ok",
      findings: [],
      confirmed: true,
    }),
  ).toThrow();
  expect(() =>
    usageSchema.parse({
      inputTokens: 2,
      cachedInputTokens: 3,
      outputTokens: 1,
      estimatedUsd: null,
      raw: {},
    }),
  ).toThrow();
});
it("permits disabled workflow, requires explicit valid pricing for active roles", () => {
  expect(
    parsePolicy({ trustedAuthors: [], roles: {}, maxEstimatedUsd: 0 }, [
      "codex",
      "claude",
    ]).roles,
  ).toEqual({});
  expect(() =>
    parsePolicy(
      {
        trustedAuthors: ["karol"],
        roles: {
          analyst: { provider: "unknown", model: "x", allocationUsd: 1 },
        },
        maxEstimatedUsd: 2,
      },
      ["codex", "claude"],
    ),
  ).toThrow();
  expect(() =>
    parsePolicy({ trustedAuthors: [], roles: {}, maxEstimatedUsd: NaN }, []),
  ).toThrow();
});

it("bounds aggregate plans without changing the per-role schema", () => {
  const c = makeCandidate();
  c.context.task = "coverage-gap";
  const p = makePlan();
  p.cases = Array.from({ length: 160 }, (_, i) => ({
    ...p.cases[0]!,
    id: "round-" + (1 + Math.floor(i / 20)) + ":case-" + i,
  }));
  p.paths = Array.from(
    { length: 160 },
    (_, i) => "frontend/src/a" + i + ".test.ts",
  );
  c.plan = p;
  c.files = p.paths;
  expect(candidateSchema.parse(c).plan!.cases).toHaveLength(160);
  expect(() => testPlanSchema.parse(p)).toThrow();
  p.cases.push({ ...p.cases[0]!, id: "overflow" });
  expect(() => candidateSchema.parse(c)).toThrow();
  p.cases.pop();
  p.paths.push("frontend/src/overflow.test.ts");
  c.files = p.paths;
  expect(() => candidateSchema.parse(c)).toThrow();
});

it("keeps scoped PR-change artifact limits even after introducing aggregate coverage plans", () => {
  const c = makeCandidate();
  const p = makePlan();
  p.cases = Array.from({ length: 21 }, (_, i) => ({
    ...p.cases[0]!,
    id: "c" + i,
  }));
  c.plan = p;
  expect(() => candidateSchema.parse(c)).toThrow();
});
