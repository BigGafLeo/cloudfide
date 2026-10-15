import { writeFile, readFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import {
  candidateSchema,
  limits,
  type RunContext,
  type TestPlan,
  type WriterResult,
  type CallRecord,
  type CandidateManifest,
} from "./contracts.js";
import { validatePatchPath, assertSafeTarget } from "./paths.js";
import {
  scratch,
  removeScratch,
  copySnapshot,
  git,
  initIndex,
} from "./workspace.js";
export function patchHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
export async function validateCandidatePatch(
  patchText: string,
  files: string[],
  headRoot: string,
  maxFiles: number = limits.aggregateFiles,
): Promise<void> {
  if (
    Buffer.byteLength(patchText) > limits.patch ||
    patchText.includes("\0") ||
    !files.length ||
    files.length > maxFiles ||
    new Set(files).size !== files.length
  )
    throw new Error("patch bounds");
  for (const path of files) await assertSafeTarget(headRoot, path);
  const paths: string[] = [];
  for (const line of patchText.split("\n")) {
    if (/^diff --git /.test(line)) {
      const m = /^diff --git a\/([A-Za-z0-9_./-]+) b\/([A-Za-z0-9_./-]+)$/.exec(
        line,
      );
      if (!m || m[1] !== m[2]) throw new Error("patch path/rename");
      validatePatchPath(m[1]!);
      paths.push(m[1]!);
    }
    if (
      /^(?:old mode|new mode|deleted file|rename |copy |GIT binary patch|Binary files)/.test(
        line,
      ) ||
      /^new file mode (?!100644$)/.test(line)
    )
      throw new Error("patch mode/binary/delete");
    if (line === "+++ /dev/null") throw new Error("deletion forbidden");
  }
  if (
    JSON.stringify([...new Set(paths)].sort()) !==
      JSON.stringify([...files].sort()) ||
    paths.length !== files.length
  )
    throw new Error("patch manifest scope mismatch");
  const root = await scratch("patch-check");
  try {
    await copySnapshot(headRoot, root);
    await initIndex(root);
    await git(root, ["apply", "--check", "--whitespace=error", "-"], patchText);
    await git(root, ["apply", "--whitespace=error", "-"], patchText);
    await assertAppliedScope(root, files);
  } finally {
    await removeScratch(root);
  }
}
export async function assertAppliedScope(
  root: string,
  files: string[],
): Promise<void> {
  const changed = (
    await git(root, ["diff", "--name-only", "--no-ext-diff", "--no-textconv"])
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  const added = (
    await git(root, ["ls-files", "--others", "--exclude-standard"])
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  const actual = [...new Set([...changed, ...added])].sort();
  if (JSON.stringify(actual) !== JSON.stringify([...files].sort()))
    throw new Error("actual patch scope differs");
  for (const path of actual) {
    await assertSafeTarget(root, path);
    const stat = await import("node:fs/promises").then((fs) =>
      fs.lstat(join(root, path)),
    );
    if (!stat.isFile() || (stat.mode & 0o111) !== 0)
      throw new Error("patch executable/link");
  }
}
export async function freezeCandidate(
  context: RunContext,
  plan: TestPlan,
  writer: WriterResult | null,
  calls: CallRecord[],
  skillsUsed: string[],
  headRoot: string,
  outputRoot: string,
  options: { aggregate?: boolean } = {},
): Promise<CandidateManifest> {
  if (writer === null) {
    if (plan.decision === "write") throw new Error("writer missing");
    return candidateSchema.parse({
      context,
      plan,
      patch: null,
      files: [],
      calls,
      skillsUsed,
      producerJob: "agent",
      status: plan.decision,
    });
  }
  if (
    writer.status !== "written" ||
    plan.decision !== "write" ||
    writer.files.length >
      (options.aggregate ? limits.aggregateFiles : limits.files)
  )
    throw new Error("invalid candidate phase");
  if (
    writer.caseIds.some((id) => !plan.cases.some((c) => c.id === id)) ||
    plan.cases.some((c) => !writer.caseIds.includes(c.id))
  )
    throw new Error("case IDs mismatch");
  for (const file of writer.files) {
    await assertSafeTarget(headRoot, file.path);
    if (!plan.paths.includes(file.path)) throw new Error("unplanned path");
  }
  const root = await scratch("candidate");
  try {
    await copySnapshot(headRoot, root);
    await initIndex(root);
    for (const file of writer.files) {
      await assertSafeTarget(root, file.path);
      await mkdir(dirname(join(root, file.path)), { recursive: true });
      await writeFile(join(root, file.path), file.content, { mode: 0o644 });
      await git(root, ["add", "--intent-to-add", "--force", "--", file.path]);
    }
    const patch = await git(root, [
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--src-prefix=a/",
      "--dst-prefix=b/",
    ]);
    const files = writer.files.map((f) => f.path);
    await validateCandidatePatch(
      patch,
      files,
      headRoot,
      options.aggregate ? limits.aggregateFiles : limits.files,
    );
    await mkdir(outputRoot, { recursive: true });
    await writeFile(join(outputRoot, "candidate.patch"), patch);
    return candidateSchema.parse({
      context,
      plan,
      files,
      calls,
      skillsUsed,
      producerJob: "agent",
      status: "candidate",
      patch: {
        name: "candidate.patch",
        sha256: patchHash(patch),
        bytes: Buffer.byteLength(patch),
      },
    });
  } finally {
    await removeScratch(root);
  }
}
