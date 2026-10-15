import { copySnapshot, scratch, removeScratch } from "../src/workspace.js";
import { collectEvidence } from "../src/precollect.js";
import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { limits, runContextSchema } from "../src/contracts.js";
const source = resolve(process.argv[2] ?? ".."),
  root = await scratch("probe");
try {
  await copySnapshot(source, root);
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
  const evidence = await collectEvidence(
    root,
    context,
    new AbortController().signal,
  );
  await mkdir("output", { recursive: true });
  await writeFile(
    join("output", "precollection-probe.json"),
    JSON.stringify(evidence, null, 2),
  );
  console.log(
    JSON.stringify({
      complete: evidence.complete,
      checks: evidence.checks.map((c) => ({
        id: c.id,
        status: c.status,
        reason: c.reason,
      })),
      coverage: evidence.coverage,
    }),
  );
  if (!evidence.complete || evidence.checks.some((c) => c.status !== "passed"))
    process.exitCode = 1;
} finally {
  await removeScratch(root);
}
