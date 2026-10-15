import { readFile, writeFile } from "node:fs/promises";
import { collectEvidence } from "../src/precollect.js";
import { limits, runContextSchema } from "../src/contracts.js";
const event = JSON.parse(
  await readFile(process.env.GITHUB_EVENT_PATH ?? "", "utf8"),
);
const sha = process.env.GITHUB_SHA ?? "";
const context = runContextSchema.parse({
  repository: process.env.GITHUB_REPOSITORY,
  repositoryId: event.repository.id,
  pr: event.pull_request?.number ?? 1,
  executionRunId: process.env.GITHUB_RUN_ID,
  executionAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
  trigger: { kind: "dispatch" },
  baseSha: sha,
  headSha: sha,
  controlSha: sha,
  task: "pr-change",
  deadline: new Date(Date.now() + limits.runMs).toISOString(),
});
const evidence = await collectEvidence(
  process.cwd(),
  context,
  new AbortController().signal,
);
await writeFile(
  ".agent-evidence/summary.json",
  JSON.stringify(evidence, null, 2),
);
if (!evidence.complete || evidence.checks.some((c) => c.status !== "passed"))
  process.exitCode = 1;
