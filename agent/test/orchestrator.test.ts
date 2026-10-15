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
