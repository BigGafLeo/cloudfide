import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCoverageRounds } from "../src/rounds.js";
import { compareCoverage } from "../src/coverage.js";
import { testPlanSchema, writerResultSchema } from "../src/contracts.js";
import type {
  AnalysisBundle,
  CoverageReport,
  ProviderAdapter,
} from "../src/contracts.js";
import {
  activePolicy,
  completedNative,
  makeContext,
  makePlan,
  makeVerification,
} from "./support.js";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((r) => rm(r, { recursive: true, force: true })),
  );
});
function coverage(frontend: number, backend = frontend): CoverageReport {
  const app = (n: number) =>
    Object.fromEntries(
      ["lines", "branches", "statements", "functions"].map((k) => [
        k,
        { covered: n, total: 100, pct: n },
      ]),
    );
  return {
    frontend: app(frontend),
    backend: app(backend),
    gaps: [
      "frontend/src/router.ts:1",
      "frontend/src/hooks/mutation.ts:1",
      "backend/src/factory.ts:1",
    ],
  } as CoverageReport;
}
async function fixture(values: number[] = [65, 82]) {
  const root = await mkdtemp(join(tmpdir(), "cloudfide-rounds-"));
  roots.push(root);
  const head = join(root, "head"),
    outputRoot = join(root, "out");
  await mkdir(head);
  const files = [
    "frontend/src/router.ts",
    "frontend/src/hooks/mutation.ts",
    "backend/src/factory.ts",
    ...Array.from({ length: 6 }, (_, i) => "frontend/src/utils/u" + i + ".ts"),
  ].map((path) => ({ path, content: "export const value = 1;\n" }));
  for (const f of files) {
    await mkdir(join(head, f.path, ".."), { recursive: true });
    await writeFile(join(head, f.path), f.content);
  }
  const context = { ...makeContext(), task: "coverage-gap" as const };
  const policy = { ...activePolicy(), maxEstimatedUsd: 17 };
  const initial = {
    context,
    checks: makeVerification().checks,
    coverage: coverage(50),
    complete: true,
    comparisonReason: "same head",
  };
  const bundles: AnalysisBundle[] = [],
    patches: string[] = [];
  let calls = 0,
    round = 0;
  const adapter: ProviderAdapter = {
    id: "fixture",
    assertCapabilities: async () => {},
    run: async (r) => {
      calls++;
      const input = JSON.parse(r.prompt.slice(r.prompt.lastIndexOf("\n") + 1));
      if (r.role === "analyst") {
        round++;
        bundles.push(input);
        const p = makePlan();
        p.paths = ["frontend/src/router" + round + ".test.ts"];
        p.cases[0]!.sourceLocation = "frontend/src/router.ts:1";
        return { ...completedNative(), usage: null, result: p };
      }
      return {
        ...completedNative(),
        usage: null,
        result: {
          status: "written",
          reason: "new behavior assertions",
          files: [
            {
              path: input.plan.paths[0],
              content: "// assertion round " + round + "\n",
            },
          ],
          caseIds: input.plan.cases.map((c: { id: string }) => c.id),
        },
      };
    },
  };
  const options = {
    context,
    policy,
    source: { head, files, changed: [], diff: "" },
    evidence: { head: initial, base: initial },
    adapters: new Map([["fixture", adapter]]),
    recheck: async () => true,
    signal: new AbortController().signal,
    outputRoot,
    verify: async (
      candidate: Parameters<typeof makeVerification>[0],
      _head: string,
      out: string,
    ) => {
      patches.push(await readFile(join(out, "candidate.patch"), "utf8"));
      const v = makeVerification(candidate);
      v.originalCoverage = initial.coverage;
      v.candidateCoverage = coverage(
        values[Math.min(patches.length - 1, values.length - 1)]!,
      );
      v.coverageComparison = compareCoverage(
        v.originalCoverage,
        v.candidateCoverage,
        true,
        "same head/config/runtime",
      );
      return v;
    },
  };
  return {
    options,
    bundles,
    patches,
    get calls() {
      return calls;
    },
  };
}
it("uses cumulative verified tests, refreshed coverage and history to reach both app targets", async () => {
  const f = await fixture();
  const out = await runCoverageRounds(f.options);
  expect(out.manifest.status).toBe("candidate");
  expect(out.manifest.coverageRun?.stopReason).toBe("target-reached");
  expect(out.manifest.calls).toHaveLength(4);
  expect(out.manifest.files).toEqual([
    "frontend/src/router1.test.ts",
    "frontend/src/router2.test.ts",
  ]);
  expect(out.manifest.plan!.cases.map((c) => c.id)).toEqual([
    "round-1:case-1",
    "round-2:case-1",
  ]);
  expect(
    f.bundles[1]!.files.some((f) => f.path === "frontend/src/router1.test.ts"),
  ).toBe(true);
  expect((f.bundles[1]!.evidence as any).head.coverage.frontend.lines.pct).toBe(
    65,
  );
  expect((f.bundles[1]!.evidence as any).history[0].status).toBe("accepted");
  expect(f.patches[1]).toContain("assertion round 1");
  expect(f.patches[1]).toContain("assertion round 2");
  expect(out.manifest.skillsUsed.length).toBe(
    new Set(out.manifest.skillsUsed).size,
  );
});
it("does not finish with only backend at eighty percent", async () => {
  const f = await fixture();
  let i = 0;
  const verify = f.options.verify;
  f.options.verify = async (...args) => {
    const v = await verify(...args);
    v.candidateCoverage = coverage(++i === 1 ? 70 : 82, 82);
    v.coverageComparison = compareCoverage(
      v.originalCoverage,
      v.candidateCoverage,
      true,
      "same runtime",
    );
    return v;
  };
  const out = await runCoverageRounds(f.options);
  expect(out.manifest.calls).toHaveLength(4);
  expect(out.manifest.coverageRun?.rounds).toHaveLength(2);
});
it("keeps the last verified patch after failure and passes failed checks onward", async () => {
  const f = await fixture([65, 75, 83]);
  const verify = f.options.verify;
  f.options.verify = async (...args) => {
    const v = await verify(...args);
    if (f.patches.length === 2) v.checks[0]!.status = "failed";
    return v;
  };
  const out = await runCoverageRounds(f.options);
  expect(out.patchText).toContain("assertion round 1");
  expect(out.patchText).not.toContain("assertion round 2");
  expect(out.patchText).toContain("assertion round 3");
  expect((f.bundles[2]!.evidence as any).history[1].checks[0].status).toBe(
    "failed",
  );
  expect(
    f.bundles[2]!.files.some((f) => f.path === "frontend/src/router2.test.ts"),
  ).toBe(false);
});
it("returns an already reached target without any model call", async () => {
  const f = await fixture();
  f.options.evidence.head.coverage = coverage(80);
  const out = await runCoverageRounds(f.options);
  expect(f.calls).toBe(0);
  expect(out.manifest.status).toBe("no-change");
  expect(out.manifest.coverageRun?.stopReason).toBe("target-reached");
});
it.each([
  "regression",
  "incomplete",
  "not-comparable",
  "stale-original",
] as const)("refuses %s evidence as progress", async (kind) => {
  const f = await fixture([85]);
  const verify = f.options.verify;
  f.options.verify = async (...args) => {
    const v = await verify(...args);
    if (kind === "regression")
      v.candidateCoverage.frontend.functions = {
        covered: 49,
        total: 100,
        pct: 49,
      };
    if (kind === "incomplete") v.checks.pop();
    if (kind === "not-comparable")
      v.coverageComparison = compareCoverage(
        v.originalCoverage,
        v.candidateCoverage,
        false,
        "incomplete",
      );
    if (kind === "stale-original") v.originalCoverage = coverage(40);
    return v;
  };
  const out = await runCoverageRounds(f.options);
  expect(out.patchText).toBeNull();
  expect(out.manifest.coverageRun?.stopReason).toBe("no-progress");
  expect(
    out.manifest.coverageRun?.rounds.every((r) => r.status === "rejected"),
  ).toBe(true);
});
it("retains passing assertion improvements without coverage gain and stops after consecutive no progress", async () => {
  const f = await fixture([50]);
  const out = await runCoverageRounds(f.options);
  expect(out.manifest.status).toBe("candidate");
  expect(out.manifest.coverageRun?.stopReason).toBe("no-progress");
  expect(out.manifest.coverageRun?.rounds).toHaveLength(2);
});
it("bounds rounds and shares unknown-usage reservations across the entire run", async () => {
  const f = await fixture([51, 52, 53, 54, 55, 56, 57, 58]);
  const out = await runCoverageRounds(f.options);
  expect(out.manifest.coverageRun?.stopReason).toBe("round-limit");
  expect(out.manifest.calls).toHaveLength(16);
  expect(f.calls).toBe(16);
  const limited = await fixture([51, 52, 53]);
  limited.options.policy.maxEstimatedUsd = 3;
  const partial = await runCoverageRounds(limited.options);
  expect(partial.manifest.calls).toHaveLength(3);
  expect(limited.calls).toBe(3);
  expect(partial.patchText).toContain("assertion round 1");
  expect(partial.manifest.coverageRun?.stopReason).toBe("budget-exhausted");
});
it.each(["stale", "cancelled"] as const)(
  "prevents additional paid calls when %s between rounds",
  async (kind) => {
    const f = await fixture([65, 85]);
    const verify = f.options.verify;
    let current = true;
    const controller = new AbortController();
    f.options.signal = controller.signal;
    f.options.recheck = async () => current;
    f.options.verify = async (...args) => {
      const v = await verify(...args);
      if (kind === "stale") current = false;
      else controller.abort();
      return v;
    };
    const out = await runCoverageRounds(f.options);
    expect(f.calls).toBe(2);
    expect(out.manifest.coverageRun?.stopReason).toBe(kind);
  },
);
it("keeps per-role twenty-case and twenty-file output limits", () => {
  const plan = makePlan();
  plan.cases = Array.from({ length: 21 }, (_, i) => ({
    ...plan.cases[0]!,
    id: "c" + i,
  }));
  expect(() => testPlanSchema.parse(plan)).toThrow();
  expect(() =>
    writerResultSchema.parse({
      status: "written",
      reason: "x",
      caseIds: ["c"],
      files: Array.from({ length: 21 }, (_, i) => ({
        path: "frontend/src/a" + i + ".test.ts",
        content: "x",
      })),
    }),
  ).toThrow();
});

it("passes updated uncovered units and measured test counts to the next analyst", async () => {
  const f = await fixture();
  const verify = f.options.verify;
  f.options.verify = async (...args) => {
    const v = await verify(...args);
    v.candidateCoverage.gaps = ["frontend/src/utils/u5.ts:1"];
    v.candidateTests = {
      frontend: { total: 123, failed: 0, failures: [] },
      backend: { total: 77, failed: 0, failures: [] },
    };
    return v;
  };
  await runCoverageRounds(f.options);
  expect((f.bundles[1]!.evidence as any).head.coverage.gaps).toEqual([
    "frontend/src/utils/u5.ts:1",
  ]);
  expect((f.bundles[1]!.evidence as any).head.tests.frontend.total).toBe(123);
  expect(
    f.bundles[1]!.files.some((f) => f.path === "frontend/src/utils/u5.ts"),
  ).toBe(true);
});
it("does not treat a rounded or inflated eighty-percent claim as eighty covered units", async () => {
  const f = await fixture();
  f.options.evidence.head.coverage = coverage(80);
  f.options.evidence.head.coverage.frontend.branches = {
    covered: 79,
    total: 100,
    pct: 80,
  };
  const out = await runCoverageRounds(f.options);
  expect(out.manifest.calls.length).toBeGreaterThan(0);
});
it("does not verify an identical failed patch twice", async () => {
  const f = await fixture([70]);
  const adapter = f.options.adapters.get("fixture")!;
  const original = adapter.run;
  adapter.run = async (request, signal) => {
    const native = await original(request, signal);
    if (request.role === "analyst") {
      const p = makePlan();
      p.paths = ["frontend/src/repeated.test.ts"];
      return { ...native, result: p };
    }
    return {
      ...native,
      result: {
        status: "written",
        reason: "repeat",
        files: [
          {
            path: "frontend/src/repeated.test.ts",
            content: "// identical failing assertion\n",
          },
        ],
        caseIds: ["case-1"],
      },
    };
  };
  const verify = f.options.verify;
  f.options.verify = async (...args) => {
    const v = await verify(...args);
    v.checks[0]!.status = "failed";
    return v;
  };
  const out = await runCoverageRounds(f.options);
  expect(f.patches).toHaveLength(1);
  expect(out.manifest.coverageRun?.rounds[1]?.reason).toMatch(
    /already attempted/,
  );
});

it("rejects writer case IDs that do not implement the current batch plan", async () => {
  const f = await fixture([85]);
  const adapter = f.options.adapters.get("fixture")!,
    run = adapter.run;
  adapter.run = async (request, signal) => {
    const result = await run(request, signal);
    return request.role === "writer"
      ? {
          ...result,
          result: { ...(result.result as object), caseIds: ["invented-case"] },
        }
      : result;
  };
  const out = await runCoverageRounds(f.options);
  expect(out.patchText).toBeNull();
  expect(out.manifest.coverageRun?.rounds[0]?.reason).toMatch(/batch.*plan/);
  expect(f.patches).toHaveLength(0);
});
it("rejects a writer file from an earlier plan when it is not in the current batch plan", async () => {
  const f = await fixture([65, 85]);
  const adapter = f.options.adapters.get("fixture")!,
    run = adapter.run;
  let writers = 0;
  adapter.run = async (request, signal) => {
    const result = await run(request, signal);
    if (request.role === "writer" && ++writers > 1)
      return {
        ...result,
        result: {
          ...(result.result as object),
          files: [
            {
              path: "frontend/src/router1.test.ts",
              content: "// unauthorized rewrite\n",
            },
          ],
        },
      };
    return result;
  };
  const out = await runCoverageRounds(f.options);
  expect(out.patchText).toContain("assertion round 1");
  expect(out.patchText).not.toContain("unauthorized rewrite");
  expect(out.manifest.coverageRun?.stopReason).toBe("no-progress");
  expect(f.patches).toHaveLength(1);
});

it("includes failed assertion diagnostics in the next batch history", async () => {
  const f = await fixture([65, 75, 85]);
  const verify = f.options.verify;
  f.options.verify = async (...args) => {
    const v = await verify(...args);
    if (f.patches.length === 2) {
      v.checks[0]!.status = "failed";
      v.candidateTests = {
        backend: {
          total: 50,
          failed: 1,
          failures: ["factory rejects duplicate registration: expected error"],
        },
      };
    }
    return v;
  };
  await runCoverageRounds(f.options);
  expect(
    (f.bundles[2]!.evidence as any).history[1].tests?.backend.failures,
  ).toEqual(["factory rejects duplicate registration: expected error"]);
});
it("does not call a failing initial measurement a reached target", async () => {
  const f = await fixture();
  f.options.evidence.head.coverage = coverage(80);
  f.options.evidence.head.checks[0]!.status = "failed";
  const out = await runCoverageRounds(f.options);
  expect(out.manifest.coverageRun?.stopReason).toBe("incomplete");
  expect(out.manifest.status).toBe("inconclusive");
});

it.each([
  "Adds budget boundary assertions",
  "Exercises deadline expiry assertions",
])(
  "does not interpret successful model rationale as host control: %s",
  async (reason) => {
    const f = await fixture([60, 85]),
      adapter = f.options.adapters.get("fixture")!,
      run = adapter.run;
    adapter.run = async (request, signal) => {
      const native = await run(request, signal);
      return request.role === "writer"
        ? { ...native, result: { ...(native.result as object), reason } }
        : native;
    };
    const out = await runCoverageRounds(f.options);
    expect(out.manifest.calls).toHaveLength(4);
    expect(out.manifest.coverageRun?.stopReason).toBe("target-reached");
  },
);
it.each(["between rounds", "before next writer"] as const)(
  "returns the accepted candidate and ledger when head checking throws %s",
  async (when) => {
    const f = await fixture([60, 85]);
    let verified = false,
      failed = false;
    const verify = f.options.verify,
      adapter = f.options.adapters.get("fixture")!,
      run = adapter.run;
    f.options.verify = async (...args) => {
      const v = await verify(...args);
      verified = true;
      return v;
    };
    let secondAnalyst = false;
    adapter.run = async (request, signal) => {
      const native = await run(request, signal);
      if (verified && request.role === "analyst") secondAnalyst = true;
      return native;
    };
    f.options.recheck = async () => {
      if (verified && (when === "between rounds" || secondAnalyst)) {
        failed = true;
        throw new Error("GitHub API 503");
      }
      if (failed) throw new Error("unexpected retry after head-check failure");
      return true;
    };
    const out = await runCoverageRounds(f.options);
    expect(out.patchText).toContain("assertion round 1");
    expect(out.manifest.calls).toHaveLength(when === "between rounds" ? 2 : 3);
    expect(f.calls).toBe(out.manifest.calls.length);
    expect(out.manifest.coverageRun?.rounds[0]?.status).toBe("accepted");
    expect(out.manifest.coverageRun?.stopReason).toBe("recheck-failed");
    expect(out.manifest.reason).toContain("503");
  },
);
it("admits payload headroom before spending another batch of individually valid large plans", async () => {
  const f = await fixture([51, 52, 53, 54, 55, 56, 57, 58]),
    adapter = f.options.adapters.get("fixture")!,
    run = adapter.run;
  let largest = 0;
  adapter.run = async (request, signal) => {
    const native = await run(request, signal);
    if (request.role !== "analyst") {
      const result = native.result as {
        files: { path: string; content: string }[];
      };
      return {
        ...native,
        result: {
          ...result,
          files: result.files.map((f) => ({
            ...f,
            content: f.content + "//" + "x".repeat(8192) + "\n",
          })),
        },
      };
    }
    const plan = native.result as ReturnType<typeof makePlan>;
    plan.cases = Array.from({ length: 20 }, (_, i) => ({
      ...plan.cases[0]!,
      id: "case-" + i,
      behavior: "x".repeat(4096),
      inputs: "y".repeat(4096),
      expected: "z".repeat(4096),
      requirementSource: "r".repeat(300),
      assertion: "a".repeat(100),
    }));
    largest = Math.max(largest, Buffer.byteLength(JSON.stringify(plan)));
    return { ...native, result: plan };
  };
  const out = await runCoverageRounds(f.options);
  expect(largest).toBeLessThan(262144);
  expect(Buffer.byteLength(JSON.stringify(out))).toBeLessThanOrEqual(4194304);
  expect(out.manifest.status).toBe("candidate");
  expect(out.manifest.coverageRun?.stopReason).toBe("payload-limit");
  expect(out.manifest.calls.length).toBe(f.calls);
  expect(f.calls).toBeLessThan(16);
  expect(
    out.manifest.coverageRun?.rounds.every((r) => r.plan?.cases.length === 20),
  ).toBe(true);
  expect(out.patchText).toContain("assertion round 1");
});
it.each([false, true])(
  "checks trial payload before promotion and retains earlier contents and all calls (failed checks: %s)",
  async (failedChecks) => {
    const f = await fixture([60, 85]),
      verify = f.options.verify;
    f.options.verify = async (...args) => {
      const v = await verify(...args);
      if (f.patches.length === 2) {
        v.candidateCoverage.gaps = Array.from(
          { length: 1000 },
          (_, i) => "frontend/src/" + i + "x".repeat(4060) + ":1",
        );
        if (failedChecks) v.checks[0]!.status = "failed";
        v.checks.push(
          ...Array.from({ length: 24 }, (_, i) => ({
            ...v.checks[0]!,
            id: "extra:" + i,
            gate: "advisory" as const,
            reason: "detail".repeat(680),
            command: "detail".repeat(680),
            logPath: "detail".repeat(680),
          })),
        );
      }
      return v;
    };
    const out = await runCoverageRounds(f.options);
    expect(out.patchText).toContain("assertion round 1");
    expect(out.patchText).not.toContain("assertion round 2");
    expect(out.manifest.calls).toHaveLength(4);
    expect(out.manifest.coverageRun?.stopReason).toBe("payload-limit");
    expect(out.manifest.coverageRun?.rounds[1]?.status).toBe("rejected");
    expect(out.manifest.coverageRun?.rounds[1]?.reason).toMatch(
      /payload.*detailed evidence/,
    );
    expect(Buffer.byteLength(JSON.stringify(out))).toBeLessThanOrEqual(4194304);
  },
);
