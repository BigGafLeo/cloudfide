import { expect, it } from "vitest";
import { normalizeCoverage, compareCoverage } from "../src/coverage.js";
import { makeCoverage } from "./support.js";
it("keeps branch gaps even when lines are fully covered", () => {
  const metric = { covered: 10, total: 10, pct: 100 };
  const summary = {
    backend: {
      total: {
        lines: metric,
        branches: { covered: 1, total: 4, pct: 25 },
        statements: metric,
        functions: metric,
      },
    },
    frontend: {
      total: {
        lines: metric,
        branches: metric,
        statements: metric,
        functions: metric,
      },
    },
  };
  const result = normalizeCoverage(summary, {
    backend: {
      "/tmp/backend/src/foo.ts": {
        s: { "1": 0 },
        statementMap: { "1": { start: { line: 7 } } },
      },
    },
    frontend: {},
  });
  expect(result.backend.branches.pct).toBe(25);
  expect(result.gaps).toContain("backend/src/foo.ts:7");
  expect(() => normalizeCoverage({ backend: {}, frontend: {} }, {})).toThrow();
});
it("does not manufacture deltas for non-comparable scope", () => {
  const c = makeCoverage();
  const result = compareCoverage(c, c, false, "config changed");
  expect(result.deltas).toBeNull();
  expect(result.objectiveMet).toBe(false);
});
