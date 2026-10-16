import { expect, it } from "vitest";
import { coveragePolicy, parsePolicy } from "../src/config.js";
import { activePolicy } from "./support.js";

it("defaults omitted stopAtTarget to true for absent and legacy coverage policy", () => {
  const policy = activePolicy();
  expect(coveragePolicy(policy).stopAtTarget).toBe(true);
  policy.coverage = {
    target: { lines: 80, branches: 80 },
    maxRounds: 8,
    noProgressRounds: 2,
  };
  const parsed = parsePolicy(policy, ["fixture"]);
  expect(coveragePolicy(parsed).stopAtTarget).toBe(true);
});

it("admits explicit continuation and rejects a nonboolean stop policy", () => {
  const coverage = {
    target: { lines: 80, branches: 80 },
    maxRounds: 8,
    noProgressRounds: 2,
    stopAtTarget: false,
  };
  const parsed = parsePolicy({ ...activePolicy(), coverage }, ["fixture"]);
  expect(coveragePolicy(parsed).stopAtTarget).toBe(false);
  expect(() =>
    parsePolicy(
      { ...activePolicy(), coverage: { ...coverage, stopAtTarget: "false" } },
      ["fixture"],
    ),
  ).toThrow();
});
