import { expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { createHash } from "node:crypto";
import { readArtifact } from "../src/artifacts.js";
import { makeCandidate } from "./support.js";
function fixture(extra = false) {
  const manifest = makeCandidate(),
    patchText = "patch";
  manifest.patch!.sha256 = createHash("sha256").update(patchText).digest("hex");
  manifest.patch!.bytes = 5;
  const entries: Record<string, Uint8Array> = {
    "payload.json": strToU8(JSON.stringify({ manifest, patchText })),
  };
  if (extra) entries["../escape"] = strToU8("x");
  const bytes = zipSync(entries),
    digest = "sha256:" + createHash("sha256").update(bytes).digest("hex");
  return {
    bytes,
    expected: {
      name: "candidate-123-1",
      producerJob: "agent",
      artifactId: 11,
      executionRunId: "123",
      executionAttempt: 1,
      workflowId: 9,
    },
    metadata: {
      id: 11,
      name: "candidate-123-1",
      size_in_bytes: bytes.length,
      digest,
      workflow_run: { id: 123, repository_id: 1, head_sha: "c".repeat(40) },
    },
    run: { id: 123, run_attempt: 1, workflow_id: 9, head_sha: "c".repeat(40) },
  };
}
it("binds exact artifact ID and run attempt rather than a producer claim", () => {
  const f = fixture();
  expect(
    readArtifact(f.bytes, f.expected, f.metadata, f.run).manifest.producerJob,
  ).toBe("agent");
  expect(() =>
    readArtifact(f.bytes, { ...f.expected, artifactId: 12 }, f.metadata, f.run),
  ).toThrow();
  expect(() =>
    readArtifact(f.bytes, f.expected, f.metadata, { ...f.run, run_attempt: 2 }),
  ).toThrow();
});
it("rejects extra archive entries without extracting paths", () => {
  const f = fixture(true);
  expect(() => readArtifact(f.bytes, f.expected, f.metadata, f.run)).toThrow();
});
