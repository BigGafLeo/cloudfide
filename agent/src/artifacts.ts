import { Unzip, UnzipInflate, zipSync, strToU8 } from "fflate";
import { createHash } from "node:crypto";
import {
  precollectionPayloadSchema,
  type PrecollectionPayload,
  candidatePayloadSchema,
  verificationPayloadSchema,
  reviewPayloadSchema,
  limits,
  type CandidatePayload,
  type VerificationPayload,
  type ReviewPayload,
} from "./contracts.js";
import { patchHash } from "./candidate.js";
export interface ArtifactMetadata {
  id: number;
  name: string;
  size_in_bytes: number;
  digest: string;
  workflow_run: { id: number; repository_id: number; head_sha: string };
}
export interface WorkflowRunMetadata {
  id: number;
  run_attempt: number;
  workflow_id: number;
  head_sha: string;
}
export interface ExpectedArtifact {
  name: string;
  producerJob: string;
  artifactId: number;
  executionRunId: string;
  executionAttempt: number;
  workflowId: number;
}
export function readEnvelope(bytes: Uint8Array): unknown {
  if (bytes.byteLength > limits.payload) throw new Error("archive too large");
  let count = 0,
    total = 0,
    done = false;
  const chunks: Uint8Array[] = [];
  const unzip = new Unzip((file) => {
    if (file.originalSize !== undefined && file.originalSize > limits.payload)
      throw new Error("expanded envelope bounds");
    count++;
    if (file.name !== "payload.json" || count !== 1)
      throw new Error("unexpected archive entry");
    file.ondata = (error, data, final) => {
      if (error) throw error;
      total += data.byteLength;
      if (total > limits.payload) {
        file.terminate();
        throw new Error("expanded envelope bounds");
      }
      chunks.push(data);
      if (final) done = true;
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for (let offset = 0; offset < bytes.length; offset += 1024)
    unzip.push(
      bytes.subarray(offset, offset + 1024),
      offset + 1024 >= bytes.length,
    );
  if (count !== 1 || !done) throw new Error("incomplete envelope");
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
  );
}
export function envelope(payload: unknown): Uint8Array {
  const text = JSON.stringify(payload);
  if (Buffer.byteLength(text) > limits.payload)
    throw new Error("payload too large");
  const bytes = zipSync({ "payload.json": strToU8(text) });
  if (bytes.byteLength > limits.payload) throw new Error("archive too large");
  return bytes;
}
export function readArtifact(
  bytes: Uint8Array,
  expected: ExpectedArtifact,
  metadata: ArtifactMetadata,
  run: WorkflowRunMetadata,
):
  | CandidatePayload
  | VerificationPayload
  | ReviewPayload
  | PrecollectionPayload {
  if (
    metadata.id !== expected.artifactId ||
    metadata.name !== expected.name ||
    String(metadata.workflow_run.id) !== expected.executionRunId ||
    String(run.id) !== expected.executionRunId ||
    run.run_attempt !== expected.executionAttempt ||
    run.workflow_id !== expected.workflowId ||
    run.head_sha !== metadata.workflow_run.head_sha
  )
    throw new Error("artifact identity mismatch");
  if (
    metadata.size_in_bytes !== bytes.byteLength ||
    metadata.digest !==
      "sha256:" + createHash("sha256").update(bytes).digest("hex")
  )
    throw new Error("artifact transfer digest mismatch");
  const raw = readEnvelope(bytes);
  const schema =
    expected.producerJob === "precollect"
      ? precollectionPayloadSchema
      : expected.producerJob === "agent"
        ? candidatePayloadSchema
        : expected.producerJob === "verifier"
          ? verificationPayloadSchema
          : expected.producerJob === "reviewer"
            ? reviewPayloadSchema
            : null;
  if (!schema) throw new Error("unknown producer");
  const payload = schema.parse(raw);
  if (
    payload.manifest.producerJob !== expected.producerJob ||
    payload.manifest.context.executionRunId !== expected.executionRunId ||
    payload.manifest.context.executionAttempt !== expected.executionAttempt ||
    payload.manifest.context.repositoryId !==
      metadata.workflow_run.repository_id ||
    payload.manifest.context.controlSha !== run.head_sha
  )
    throw new Error("payload identity mismatch");
  if ("patchText" in payload) {
    const patch = payload.manifest.patch;
    if (
      patch === null
        ? payload.patchText !== null
        : payload.patchText === null ||
          patch.name !== "candidate.patch" ||
          patchHash(payload.patchText) !== patch.sha256 ||
          Buffer.byteLength(payload.patchText) !== patch.bytes
    )
      throw new Error("candidate patch mismatch");
  }
  return payload;
}
