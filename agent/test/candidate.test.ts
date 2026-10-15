import { expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { freezeCandidate, validateCandidatePatch } from "../src/candidate.js";
import { makeContext, makePlan } from "./support.js";
it.each([
  "../escape.test.ts",
  "backend/src/core/config.ts",
  "frontend/src/test/setup.ts",
  "C:/tmp/x.test.ts",
  "backend/tests/fixtures/AGENTS.md",
])("rejects forbidden writer path %s before source mutation", async (path) => {
  const root = await mkdtemp(join(tmpdir(), "cloudfide-test-"));
  await mkdir(join(root, "frontend"), { recursive: true });
  await writeFile(join(root, "frontend", "original.txt"), "unchanged");
  await expect(
    freezeCandidate(
      makeContext(),
      makePlan(),
      {
        status: "written",
        reason: "ok",
        files: [{ path, content: "x" }],
        caseIds: ["case-1"],
      },
      [],
      [],
      root,
      join(root, "out"),
    ),
  ).rejects.toThrow();
  expect(await readFile(join(root, "frontend", "original.txt"), "utf8")).toBe(
    "unchanged",
  );
});
it("creates an exact new-file patch and independently rejects production paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "cloudfide-test-"));
  await writeFile(join(root, "README.md"), "source");
  const output = await mkdtemp(join(tmpdir(), "cloudfide-test-"));
  const plan = makePlan();
  const result = await freezeCandidate(
    makeContext(),
    plan,
    {
      status: "written",
      reason: "ok",
      files: [
        {
          path: plan.paths[0]!,
          content: "import {it} from 'vitest';\nit('works',()=>{});\n",
        },
      ],
      caseIds: ["case-1"],
    },
    [],
    [],
    root,
    output,
  );
  const patch = await readFile(join(output, "candidate.patch"), "utf8");
  expect(patch).toContain("new file mode 100644");
  expect(result.patch?.sha256).toBe(
    createHash("sha256").update(patch).digest("hex"),
  );
  await validateCandidatePatch(patch, result.files, root);
  const forged = patch.replaceAll(
    "frontend/src/lib/http.test.ts",
    "backend/src/core/config.ts",
  );
  await expect(
    validateCandidatePatch(forged, ["backend/src/core/config.ts"], root),
  ).rejects.toThrow();
});
it("supports no-change without a synthetic writer or patch", async () => {
  const plan = makePlan();
  plan.decision = "no-change";
  plan.paths = [];
  plan.cases = [];
  const c = await freezeCandidate(
    makeContext(),
    plan,
    null,
    [],
    [],
    tmpdir(),
    tmpdir(),
  );
  expect(c.status).toBe("no-change");
  expect(c.patch).toBeNull();
  expect(c.files).toEqual([]);
});
