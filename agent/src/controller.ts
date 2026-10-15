import type { GitHubClient } from "./github.js";
import {
  precollectionPayloadSchema,
  candidateSchema,
  sameContext,
  type RunContext,
  type CandidateManifest,
} from "./contracts.js";
import type { Policy } from "./config.js";
export function terminalCandidate(
  context: RunContext,
  status: Exclude<CandidateManifest["status"], "candidate" | "no-change">,
  reason: string,
): CandidateManifest {
  return candidateSchema.parse({
    context,
    plan: null,
    patch: null,
    files: [],
    calls: [],
    skillsUsed: [],
    producerJob: "agent",
    status,
    reason,
  });
}
export function validatePrecollection(input: unknown, context: RunContext) {
  const payload = precollectionPayloadSchema.parse(input),
    m = payload.manifest;
  if (
    !sameContext(m.context, context) ||
    !sameContext(m.base.context, context) ||
    !sameContext(m.head.context, context)
  )
    throw new Error("precollection identity mismatch");
  if (!m.base.complete || !m.head.complete)
    throw new Error("precollection incomplete");
  return m;
}
export function runnerFor(policy: Policy, review = false): string[] {
  const roles = review
    ? [policy.roles.reviewer]
    : [policy.roles.analyst, policy.roles.writer];
  return roles.some(
    (role) =>
      role?.provider === "codex" &&
      (role.auth ?? "subscription") === "subscription",
  )
    ? ["self-hosted", "linux", "cloudfide-model"]
    : ["ubuntu-latest"];
}

export async function assertWorkflowAuthentication(
  context: RunContext,
  policy: Policy,
  api: GitHubClient,
): Promise<void> {
  const roles = [
    policy.roles.analyst,
    policy.roles.writer,
    ...(policy.review.enabled ? [policy.roles.reviewer] : []),
  ];
  if (
    !roles.some(
      (role) =>
        role?.provider === "codex" &&
        (role.auth ?? "subscription") === "subscription",
    )
  )
    return;
  const repository = await api.request("/repos/" + context.repository);
  if (repository?.id !== context.repositoryId || repository?.private !== true)
    throw new Error(
      "Codex subscription CI requires a confirmed private repository; use Claude subscription or explicit API authentication for public CI",
    );
}
