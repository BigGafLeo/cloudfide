import { runMutation } from "../src/mutation.js";
import { scratch, copySnapshot, removeScratch } from "../src/workspace.js";
import { collectEvidence } from "../src/precollect.js";
import { limits, runContextSchema } from "../src/contracts.js";
import { writeFile, cp, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { runAppProcess, testImage } from "../src/execution.js";
const root = await scratch("mutation-pilot");
try {
  await copySnapshot(resolve(process.argv[2] ?? ".."), root);
  const context = runContextSchema.parse({
    repository: "BigGafLeo/cloudfide",
    repositoryId: 1416918089,
    pr: 1,
    executionRunId: "1",
    executionAttempt: 1,
    trigger: { kind: "dispatch" },
    baseSha: "22be6e3bcf54fd012104fe233ef6652dd01941ff",
    headSha: "22be6e3bcf54fd012104fe233ef6652dd01941ff",
    controlSha: "22be6e3bcf54fd012104fe233ef6652dd01941ff",
    task: "coverage-gap",
    deadline: new Date(Date.now() + limits.runMs).toISOString(),
  });
  const version = await runAppProcess(
    "node",
    ["-p", "process.version"],
    { cwd: join(root, "backend"), timeoutMs: 15000, maxBytes: 4096 },
    new AbortController().signal,
  );
  if (version.exitCode !== 0 || version.stdout.trim() !== "v24.13.1")
    throw new Error("pilot requires pinned Linux Node container");
  const e = await collectEvidence(root, context, new AbortController().signal);
  if (!e.complete || e.checks.some((c) => c.status !== "passed"))
    throw new Error("baseline not healthy");
  const result = await runMutation(
    root,
    "advisory",
    new AbortController().signal,
    undefined,
    Date.parse(context.deadline),
    false,
  );
  console.log(JSON.stringify(result));
  if (result.status !== "passed")
    throw new Error("mutation pilot failed: " + result.reason);
  await writeFile(
    "mutation-conformance.json",
    JSON.stringify(
      {
        node: "24.13.1",
        image: testImage,
        stryker: "10.0.0",
        vitest: "4.1.11",
        backend: true,
        frontendTsx: true,
        scope: "mappers.ts and SuccessNotice.tsx",
        result,
      },
      null,
      2,
    ),
  );
} finally {
  await mkdir("output", { recursive: true });
  await cp(
    join(root, ".agent-evidence"),
    join("output", "mutation-pilot-evidence"),
    { recursive: true },
  ).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
  await removeScratch(root);
}
