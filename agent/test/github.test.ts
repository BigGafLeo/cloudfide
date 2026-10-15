import { expect, it } from "vitest";
import {
  GitHubClient,
  recheckHead,
  publish,
  resolveRun,
} from "../src/github.js";
import { makeContext } from "./support.js";
it("never overwrites a stale PR or foreign marked comment", async () => {
  const writes: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (init?.method && init.method !== "GET") writes.push(url);
    return new Response(
      JSON.stringify(
        url.includes("/comments")
          ? [
              {
                id: 7,
                user: { login: "other" },
                body: "<!-- cloudfide-unit-agent -->",
              },
            ]
          : { state: "open", head: { sha: "e".repeat(40) } },
      ),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const api = new GitHubClient("token", fetcher);
  expect(await recheckHead(makeContext(), api)).toBe(false);
  expect(await publish(makeContext(), "report", api)).toBe("stale");
  expect(writes).toEqual([]);
});
it("keeps execution run distinct from upstream trigger", async () => {
  const sha = "c".repeat(40);
  const fetcher: typeof fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    let value: unknown;
    if (path.endsWith("/actions/runs/123"))
      value = {
        id: 123,
        run_attempt: 1,
        workflow_id: 9,
        head_sha: sha,
        head_branch: "main",
        event: "workflow_run",
        run_started_at: "2026-10-14T12:00:00Z",
      };
    else if (path.endsWith("/actions/runs/122"))
      value = {
        id: 122,
        status: "completed",
        run_attempt: 2,
        workflow_id: 8,
        event: "pull_request",
        head_sha: "b".repeat(40),
        pull_requests: [{ number: 2 }],
      };
    else if (path.endsWith("/actions/workflows/ci.yml")) value = { id: 8 };
    else if (path.endsWith("/pulls/2"))
      value = {
        number: 2,
        state: "open",
        user: { login: "karol" },
        base: { sha: "a".repeat(40) },
        head: { sha: "b".repeat(40), repo: { id: 1 } },
      };
    else value = { id: 1, default_branch: "main" };
    return new Response(JSON.stringify(value), { status: 200 });
  };
  const context = await resolveRun(
    { workflow_run: { id: 122 } },
    new GitHubClient("token", fetcher),
    sha,
    { repository: "owner/repo", runId: "123", attempt: 1 },
  );
  expect(context.executionRunId).toBe("123");
  expect(context.trigger).toEqual({
    kind: "workflow-run",
    workflowId: 8,
    runId: "122",
    attempt: 2,
  });
});

it("stops reading an oversized API response before JSON parsing", async () => {
  let cancelled = false,
    chunks = 0;
  const fetcher: typeof fetch = async () =>
    new Response(
      new ReadableStream({
        pull(controller) {
          if (++chunks <= 80) controller.enqueue(new Uint8Array(65536));
          else controller.close();
        },
        cancel() {
          cancelled = true;
        },
      }),
    );
  await expect(
    new GitHubClient("fixture", fetcher).request("/repos/owner/repo"),
  ).rejects.toThrow(/bounds/);
  expect(cancelled).toBe(true);
});
