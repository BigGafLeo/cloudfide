import { expect, it, vi } from "vitest";
import { runAgent, executeRole } from "../src/orchestrator.js";
import { Budget } from "../src/budget.js";
import { buildBundle } from "../src/bundle.js";
import { loadRole } from "../src/roles.js";
import {
  makeContext,
  makePlan,
  activePolicy,
  completedNative,
  makeCoverage,
} from "./support.js";
import type { ProviderAdapter, RoleRequest } from "../src/contracts.js";
function fixture() {
  const requests: RoleRequest[] = [];
  const adapter: ProviderAdapter = {
    id: "fixture",
    assertCapabilities: async () => {},
    run: async (r) => {
      requests.push(r);
      return { ...completedNative(), result: makePlan() };
    },
  };
  return { adapter, requests };
}
function bundle() {
  return buildBundle(
    makeContext(),
    { coverage: makeCoverage(), checks: [], complete: true },
    [
      {
        path: "frontend/src/lib/http.ts",
        content: "export function request() {}",
      },
    ],
    "diff",
  );
}
it("stops writer spend after stale head", async () => {
  const { adapter, requests } = fixture();
  let checked = 0;
  const b = bundle();
  const out = await runAgent(
    b.context,
    b,
    activePolicy(),
    new Map([["fixture", adapter]]),
    async () => ++checked === 1,
    new AbortController().signal,
  );
  expect(requests).toHaveLength(1);
  expect(out.writer).toBeNull();
  expect(out.status).toBe("inconclusive");
});
it("does not load another role or mutation knowledge for backend unit analysis", async () => {
  const role = await loadRole("analyst", ["backend"], false);
  expect(role.skillsUsed).toEqual([
    "analyze-unit-gaps",
    "analyze-unit-gaps/references/backend.md",
  ]);
  expect(role.text).not.toContain("Mutation score");
  expect(role.text).not.toContain("Writer output");
});
it("does not pay for missing critical oversized context", async () => {
  const { adapter, requests } = fixture();
  const b = buildBundle(
    makeContext(),
    { coverage: makeCoverage(), checks: [], complete: true },
    [{ path: "backend/src/core/config.ts", content: "x".repeat(300000) }],
    "",
  );
  const out = await runAgent(
    b.context,
    b,
    activePolicy(),
    new Map([["fixture", adapter]]),
    async () => true,
    new AbortController().signal,
  );
  expect(out.status).toBe("inconclusive");
  expect(requests).toHaveLength(0);
});

it("preserves final usage and validation cause for a zero-millisecond completed call", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(1);
  try {
    const b = bundle();
    const adapter: ProviderAdapter = {
      id: "fixture",
      assertCapabilities: async () => {},
      run: async () => ({
        ...completedNative(),
        result: "invalid role output",
      }),
    };
    const out = await runAgent(
      b.context,
      b,
      activePolicy(),
      new Map([["fixture", adapter]]),
      async () => true,
      new AbortController().signal,
    );
    expect(out.reason).toMatch(/expected object/);
    expect(out.calls[0]?.usage?.estimatedUsd).toBe(0.25);
  } finally {
    clock.mockRestore();
  }
});
it("rejects unsafe analyst paths before dispatching the writer", async () => {
  const { adapter, requests } = fixture();
  adapter.run = async (r) => {
    requests.push(r);
    return {
      ...completedNative(),
      result: { ...makePlan(), paths: ["backend/src/core/config.ts"] },
    };
  };
  const b = bundle(),
    out = await runAgent(
      b.context,
      b,
      activePolicy(),
      new Map([["fixture", adapter]]),
      async () => true,
      new AbortController().signal,
    );
  expect(requests).toHaveLength(1);
  expect(out.status).toBe("inconclusive");
  expect(out.reason).toMatch(/scope|path/);
});

it("still gives a role half an hour after 45 minutes of preparation", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
  try {
    const context = makeContext();
    const policy = activePolicy();
    const { adapter, requests } = fixture();
    clock.mockReturnValue(1000 + 45 * 60_000);
    await executeRole(
      "analyst",
      context,
      {},
      ["backend"],
      policy,
      new Map([["fixture", adapter]]),
      new Budget(policy, Date.parse(context.deadline)),
      async () => true,
      new AbortController().signal,
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]!.timeoutMs).toBeGreaterThanOrEqual(30 * 60_000);
  } finally {
    clock.mockRestore();
  }
});

function valuePlan() {
  const plan = makePlan();
  return {
    ...plan,
    cases: plan.cases.map((c) => ({
      ...c,
      value: {
        action: "add" as "add" | "strengthen",
        testPath: plan.paths[0]!,
        existingTests: [] as { path: string; name: string }[],
        regression: "request attempts JSON parsing for 204",
        rationale: "Protects a real empty-body response with one fetch stub",
      },
    })),
  };
}
async function runValuePlan(plan = valuePlan(), files = bundle().files) {
  const requests: RoleRequest[] = [];
  const adapter: ProviderAdapter = {
    id: "fixture",
    assertCapabilities: async () => {},
    run: async (request) => {
      requests.push(request);
      return {
        ...completedNative(),
        result:
          request.role === "analyst"
            ? plan
            : {
                status: "written",
                reason: "asserts no parsing",
                caseIds: plan.cases.map((c) => c.id),
                files: [
                  { path: plan.cases[0]!.value.testPath, content: "assertion" },
                ],
              },
      };
    },
  };
  const b = { ...bundle(), files };
  const out = await runAgent(
    b.context,
    b,
    activePolicy(),
    new Map([["fixture", adapter]]),
    async () => true,
    new AbortController().signal,
  );
  return { out, requests };
}
it.each([
  [
    "missing existing test",
    (p: ReturnType<typeof valuePlan>) => {
      p.cases[0]!.value.existingTests = [
        { path: p.paths[0]!, name: "204 body" },
      ];
    },
  ],
  [
    "target outside allowed plan",
    (p: ReturnType<typeof valuePlan>) => {
      p.cases[0]!.value.testPath = "frontend/src/other.test.ts";
    },
  ],
  [
    "source outside context",
    (p: ReturnType<typeof valuePlan>) => {
      p.cases[0]!.sourceLocation = "frontend/src/missing.ts:1";
    },
  ],
  [
    "non-test target",
    (p: ReturnType<typeof valuePlan>) => {
      p.paths = ["backend/tests/fixtures/data.ts"];
      p.cases[0]!.value.testPath = p.paths[0]!;
    },
  ],
])(
  "stops writer spend for invalid value evidence: %s",
  async (_name, change) => {
    const plan = valuePlan();
    change(plan);
    const { out, requests } = await runValuePlan(plan);
    expect(out.status).toBe("inconclusive");
    expect(requests.map((r) => r.role)).toEqual(["analyst"]);
  },
);
it("requires strengthen evidence naming an existing test in that target", async () => {
  const plan = valuePlan();
  plan.cases[0]!.value.action = "strengthen";
  const files = [
    ...bundle().files,
    { path: plan.paths[0]!, content: "it('204 body',()=>{});" },
    { path: "frontend/src/other.test.ts", content: "it('other',()=>{});" },
  ];
  for (const existingTests of [
    [],
    [{ path: "frontend/src/other.test.ts", name: "other" }],
  ]) {
    plan.cases[0]!.value.existingTests = existingTests;
    const { out, requests } = await runValuePlan(plan, files);
    expect(out.status).toBe("inconclusive");
    expect(requests).toHaveLength(1);
  }
  plan.cases[0]!.value.existingTests = [
    { path: plan.paths[0]!, name: "204 body" },
  ];
  const { out, requests } = await runValuePlan(plan, files);
  expect(out.status).toBe("candidate");
  const writerInput = JSON.parse(requests[1]!.prompt.split("\n").at(-1)!);
  expect(writerInput.bundle.files).toContainEqual(files[1]);
});
it("permits a new test file with source in context and supplied test comparison", async () => {
  const plan = valuePlan();
  plan.cases[0]!.sourceLocation = "frontend/src/lib/http.ts:12:7";
  plan.cases[0]!.value.existingTests = [
    { path: "frontend/src/lib/request.test.ts", name: "JSON success" },
  ];
  const files = [
    ...bundle().files,
    {
      path: "frontend/src/lib/request.test.ts",
      content: "it('JSON success',()=>{});",
    },
  ];
  const { out, requests } = await runValuePlan(plan, files);
  expect(out.status).toBe("candidate");
  expect(requests.map((r) => r.role)).toEqual(["analyst", "writer"]);
});
it("rejects writer output missing any planned target", async () => {
  const plan = valuePlan();
  plan.paths.push("frontend/src/another.test.ts");
  plan.cases.push({
    ...structuredClone(plan.cases[0]!),
    id: "case-2",
    value: { ...plan.cases[0]!.value, testPath: plan.paths[1]! },
  });
  const { out } = await runValuePlan(plan);
  expect(out.status).toBe("inconclusive");
  expect(out.writer).toBeNull();
  expect(out.reason).toMatch(/target/);
});
