import { runMutation } from "../src/mutation.js";
import { expect, it, vi } from "vitest";
import { mkdtemp, writeFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { verifyCandidate } from "../src/verify.js";
import { makeCandidate, makeContext, makePlan } from "./support.js";
import { freezeCandidate } from "../src/candidate.js";
it("rejects a valid-digest production patch at consumer before executing commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloudfide-test-"));
  const patch =
    "diff --git a/backend/src/core/config.ts b/backend/src/core/config.ts\nnew file mode 100644\n--- /dev/null\n+++ b/backend/src/core/config.ts\n@@ -0,0 +1 @@\n+evil\n";
  await writeFile(join(root, "candidate.patch"), patch);
  const c = makeCandidate();
  c.files = ["backend/src/core/config.ts"];
  c.patch = {
    name: "candidate.patch",
    sha256: createHash("sha256").update(patch).digest("hex"),
    bytes: Buffer.byteLength(patch),
  };
  await expect(
    verifyCandidate(c, root, root, new AbortController().signal),
  ).rejects.toThrow(/path|scope/);
});

it("keeps generated precollection reports outside candidate scope checks", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloudfide-test-")),
    out = await mkdtemp(join(tmpdir(), "cloudfide-test-"));
  for (const app of ["backend", "frontend"]) {
    const dir = join(root, app);
    await mkdir(dir, { recursive: true });
    const pkg = {
      name: "fixture",
      version: "1.0.0",
      type: "module",
      scripts: {
        test: "node fixture.mjs unit",
        "test:coverage": "node fixture.mjs coverage",
        typecheck: "node fixture.mjs typecheck",
        "db:generate": "node fixture.mjs generate",
      },
    };
    await writeFile(join(dir, "package.json"), JSON.stringify(pkg));
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
      join(dir, "fixture.mjs"),
      "import{writeFileSync,mkdirSync}from'node:fs';if(process.argv[2]==='unit')writeFileSync('.agent-tests.json',JSON.stringify({numTotalTests:1,numFailedTests:0}));if(process.argv[2]==='coverage'){mkdirSync('coverage',{recursive:true});const m={covered:1,total:1,pct:100};writeFileSync('coverage/coverage-summary.json',JSON.stringify({total:{lines:m,branches:m,statements:m,functions:m}}));writeFileSync('coverage/coverage-final.json','{}');}",
    );
  }
  const plan = makePlan();
  plan.cases.push({
    ...plan.cases[0]!,
    id: "case-2",
    sourceLocation: "frontend/src/lib/http.ts:12:7",
  });
  const candidate = await freezeCandidate(
    makeContext(),
    plan,
    {
      status: "written",
      reason: "test",
      caseIds: ["case-1", "case-2"],
      files: [{ path: plan.paths[0]!, content: "// unit fixture\n" }],
    },
    [],
    [],
    root,
    out,
  );
  const result = await verifyCandidate(
    candidate,
    root,
    out,
    new AbortController().signal,
    { mutation: { enabled: true, gate: "advisory" } },
  );
  expect(result.checks.every((check) => check.status === "passed")).toBe(true);
  expect(result.coverageComparison.status).toBe("comparable");
  expect(vi.mocked(runMutation).mock.calls[0]?.[3]).toEqual([
    "frontend/src/lib/http.ts",
  ]);
}, 30000);

vi.mock("../src/mutation.js", () => ({
  runMutation: vi.fn(async () => ({
    id: "mutation",
    gate: "advisory",
    status: "passed",
    reason: "fixture",
    command: "fixture",
    exitCode: 0,
    logPath: "",
  })),
}));

vi.mock("../src/execution.js", async (original) => ({
  ...(await original<typeof import("../src/execution.js")>()),
  runAppProcess: (await import("./fixture-execution.js")).runFixtureProcess,
}));
