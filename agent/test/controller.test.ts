import { GitHubClient } from "../src/github.js";
import { expect, it } from "vitest";
import { makeContext, activePolicy } from "./support.js";
import {
  terminalCandidate,
  validatePrecollection,
  runnerFor,
  assertWorkflowAuthentication,
} from "../src/controller.js";
import { emptyCoverage } from "../src/coverage.js";
it("requires complete exact-context evidence before any model call", () => {
  const context = makeContext(),
    evidence = {
      context,
      coverage: emptyCoverage(),
      checks: [],
      complete: true,
      comparisonReason: "fixture",
    };
  const payload = {
    manifest: {
      context,
      producerJob: "precollect",
      base: evidence,
      head: evidence,
    },
  };
  expect(validatePrecollection(payload, context).head.complete).toBe(true);
  expect(() =>
    validatePrecollection(
      {
        ...payload,
        manifest: {
          ...payload.manifest,
          head: { ...evidence, complete: false },
        },
      },
      context,
    ),
  ).toThrow(/incomplete/);
  expect(() =>
    validatePrecollection(payload, { ...context, headSha: "e".repeat(40) }),
  ).toThrow(/identity/);
});
it("keeps a terminal reason without fabricating a model plan or completed call", () => {
  const c = terminalCandidate(
    makeContext(),
    "inconclusive",
    "precollection failed",
  );
  expect(c.plan).toBeNull();
  expect(c.calls).toEqual([]);
  expect(c.reason).toBe("precollection failed");
  expect(runnerFor(activePolicy())).toEqual(["ubuntu-latest"]);
  const policy = activePolicy();
  policy.roles.analyst!.provider = "codex";
  policy.roles.analyst!.auth = "subscription";
  expect(runnerFor(policy)).toEqual([
    "self-hosted",
    "linux",
    "cloudfide-model",
  ]);
});

function repositoryApi(metadata: unknown) {
  return new GitHubClient("fixture", async (input) => {
    expect(String(input)).toBe("https://api.github.com/repos/owner/repo");
    return new Response(JSON.stringify(metadata), { status: 200 });
  });
}
it.each(["analyst", "writer", "reviewer"] as const)(
  "blocks a public workflow with an active Codex subscription %s",
  async (role) => {
    const policy = activePolicy();
    policy.roles[role]!.provider = "codex";
    if (role === "reviewer") policy.review.enabled = true;
    await expect(
      assertWorkflowAuthentication(
        makeContext(),
        policy,
        repositoryApi({ id: 1, private: false }),
      ),
    ).rejects.toThrow(/Codex subscription.*private repository/);
  },
);
it.each([
  { id: 1 },
  { id: 1, private: "true" },
  { id: 2, private: true },
  null,
])(
  "rejects unknown visibility or mismatched repository metadata: %j",
  async (metadata) => {
    const policy = activePolicy();
    policy.roles.analyst!.provider = "codex";
    policy.roles.analyst!.auth = "subscription";
    await expect(
      assertWorkflowAuthentication(
        makeContext(),
        policy,
        repositoryApi(metadata),
      ),
    ).rejects.toThrow(/Codex subscription.*private repository/);
  },
);
it("allows Codex subscription only after confirming the private repository through GitHub", async () => {
  const policy = activePolicy();
  policy.roles.writer!.provider = "codex";
  await expect(
    assertWorkflowAuthentication(
      makeContext(),
      policy,
      repositoryApi({ id: 1, private: true }),
    ),
  ).resolves.toBeUndefined();
});
it("permits public Claude subscription and explicit Codex API without activating a disabled reviewer", async () => {
  const policy = activePolicy();
  policy.roles.analyst!.provider = "claude";
  policy.roles.analyst!.auth = "subscription";
  policy.roles.writer!.provider = "codex";
  policy.roles.writer!.auth = "api";
  policy.roles.reviewer!.provider = "codex";
  await expect(
    assertWorkflowAuthentication(
      makeContext(),
      policy,
      repositoryApi({ id: 1, private: false }),
    ),
  ).resolves.toBeUndefined();
});
