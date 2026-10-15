import { expect, it, vi } from "vitest";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { scratch, removeScratch } from "../src/workspace.js";
import { collectPrecollection } from "../src/precollect.js";
import { makeContext } from "./support.js";
it("does not reuse stale reports when successful commands produce no fresh evidence", async () => {
  const root = await scratch("test-evidence"),
    out = await scratch("precollect-output");
  try {
    for (const app of ["backend", "frontend"]) {
      const dir = join(root, app);
      await mkdir(join(dir, "coverage"), { recursive: true });
      await writeFile(
        join(dir, "package.json"),
        JSON.stringify({
          name: "fixture",
          version: "1.0.0",
          scripts: {
            test: 'node -e ""',
            "test:coverage": 'node -e ""',
            typecheck: 'node -e ""',
            "db:generate": 'node -e ""',
          },
        }),
      );
      await writeFile(
        join(dir, "package-lock.json"),
        JSON.stringify({
          name: "fixture",
          version: "1.0.0",
          lockfileVersion: 3,
          requires: true,
          packages: { "": { name: "fixture", version: "1.0.0" } },
        }),
      );
      await writeFile(
        join(dir, ".agent-tests.json"),
        '{"numTotalTests":1,"numFailedTests":0}',
      );
      const m = { covered: 1, total: 1, pct: 100 };
      await writeFile(
        join(dir, "coverage/coverage-summary.json"),
        JSON.stringify({
          total: { lines: m, branches: m, statements: m, functions: m },
        }),
      );
      await writeFile(join(dir, "coverage/coverage-final.json"), "{}");
    }
    const result = await collectPrecollection(
      root,
      root,
      makeContext(),
      out,
      new AbortController().signal,
    );
    expect(result.head.complete).toBe(false);
    for (const phase of ["base-evidence", "head-evidence"])
      expect(
        await readFile(join(out, phase, "backend/install.log"), "utf8"),
      ).toBe(
        await readFile(
          join(root, ".agent-evidence/backend/install.log"),
          "utf8",
        ),
      );
  } finally {
    await removeScratch(root);
    await removeScratch(out);
  }
}, 30000);

vi.mock("../src/execution.js", async (original) => ({
  ...(await original<typeof import("../src/execution.js")>()),
  runAppProcess: (await import("./fixture-execution.js")).runFixtureProcess,
}));
