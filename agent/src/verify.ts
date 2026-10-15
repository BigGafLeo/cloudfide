import { runMutation } from "./mutation.js";
import { readFile, mkdir, writeFile, cp } from "node:fs/promises";
import { join } from "node:path";
import {
  candidateSchema,
  verificationSchema,
  type CandidateManifest,
  type VerificationManifest,
} from "./contracts.js";
import {
  validateCandidatePatch,
  assertAppliedScope,
  patchHash,
} from "./candidate.js";
import {
  scratch,
  removeScratch,
  copySnapshot,
  initIndex,
  git,
} from "./workspace.js";
import { collectEvidence } from "./precollect.js";
import { compareCoverage } from "./coverage.js";
export async function verifyCandidate(
  input: CandidateManifest,
  headRoot: string,
  outputRoot: string,
  signal: AbortSignal,
  options: { mutation: { enabled: boolean; gate: "advisory" | "required" } } = {
    mutation: { enabled: false, gate: "advisory" },
  },
): Promise<VerificationManifest> {
  const candidate = candidateSchema.parse(input);
  if (candidate.status !== "candidate" || !candidate.patch)
    throw new Error("candidate missing");
  const patch = await readFile(join(outputRoot, "candidate.patch"), "utf8");
  if (
    patchHash(patch) !== candidate.patch.sha256 ||
    Buffer.byteLength(patch) !== candidate.patch.bytes
  )
    throw new Error("patch digest mismatch");
  await validateCandidatePatch(patch, candidate.files, headRoot);
  const root = await scratch("verify"),
    originalRoot = await scratch("original");
  try {
    await copySnapshot(headRoot, root);
    await initIndex(root);
    await copySnapshot(headRoot, originalRoot);
    const original = await collectEvidence(
      originalRoot,
      candidate.context,
      signal,
    );
    await git(
      root,
      ["apply", "--check", "--whitespace=error", "-"],
      patch,
      signal,
    );
    await git(root, ["apply", "--whitespace=error", "-"], patch, signal);
    await assertAppliedScope(root, candidate.files);
    const checked = await collectEvidence(root, candidate.context, signal);
    if (options.mutation.enabled)
      checked.checks.push(
        await runMutation(
          root,
          options.mutation.gate,
          signal,
          [
            ...new Set(
              candidate.plan!.cases.map((c) =>
                c.sourceLocation.replace(/:\d+(?::\d+)?$/, ""),
              ),
            ),
          ].slice(0, 2),
          Date.parse(candidate.context.deadline),
        ),
      );
    if (!checked.complete)
      checked.checks.push({
        id: "evidence",
        gate: "required",
        status: "inconclusive",
        reason: "required report incomplete",
        command: "normalize reports",
        exitCode: null,
        logPath: "",
      });
    const result = verificationSchema.parse({
      context: candidate.context,
      patchSha256: candidate.patch.sha256,
      producerJob: "verifier",
      checks: checked.checks,
      originalCoverage: original.coverage,
      candidateCoverage: checked.coverage,
      coverageComparison: compareCoverage(
        original.coverage,
        checked.coverage,
        original.complete && checked.complete,
        original.complete
          ? "same head/config/runtime"
          : "original evidence incomplete",
      ),
      facts: [],
    });
    await mkdir(outputRoot, { recursive: true });
    await cp(
      join(root, ".agent-evidence"),
      join(outputRoot, ".agent-evidence"),
      { recursive: true },
    );
    await cp(
      join(originalRoot, ".agent-evidence"),
      join(outputRoot, "original-evidence"),
      { recursive: true },
    );
    await writeFile(
      join(outputRoot, "verification.json"),
      JSON.stringify(result, null, 2),
    );
    return result;
  } finally {
    await removeScratch(root);
    await removeScratch(originalRoot);
  }
}
