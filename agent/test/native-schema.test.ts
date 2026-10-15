import { expect, it } from "vitest";
import { probeSchema } from "../src/providers/conformance.js";
import { executeRole } from "../src/orchestrator.js";
import { Budget } from "../src/budget.js";
import {
  activePolicy,
  completedNative,
  makeContext,
  makePlan,
} from "./support.js";
import type { ProviderAdapter, Role, RoleRequest } from "../src/contracts.js";
const dialect = "http://json-schema.org/draft-07/schema#";
it("generates a probe schema accepted by the pinned native CLI dialect", () => {
  expect(probeSchema.$schema).toBe(dialect);
  expect(probeSchema.additionalProperties).toBe(false);
});
it.each(["analyst", "writer", "reviewer"] as Role[])(
  "sends a native-compatible strict schema to the %s role",
  async (role) => {
    const requests: RoleRequest[] = [];
    const results = {
      analyst: makePlan(),
      writer: { status: "dispute", reason: "fixture", files: [], caseIds: [] },
      reviewer: { status: "passed", reason: "fixture", findings: [] },
    };
    const adapter: ProviderAdapter = {
      id: "fixture",
      assertCapabilities: async () => {},
      run: async (request) => {
        requests.push(request);
        return { ...completedNative(), result: results[role] };
      },
    };
    const context = makeContext(),
      policy = activePolicy();
    await executeRole(
      role,
      context,
      {},
      ["backend"],
      policy,
      new Map([["fixture", adapter]]),
      new Budget(policy, Date.parse(context.deadline)),
      async () => true,
      new AbortController().signal,
    );
    const schema = requests[0]!.schema as Record<string, unknown>;
    expect(schema.$schema).toBe(dialect);
    expect(schema.additionalProperties).toBe(false);
  },
);
