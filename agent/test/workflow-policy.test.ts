import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { activePolicy } from "./support.js";

let scratch: string | undefined;
const argv = [...process.argv];
afterEach(async () => {
  process.argv = [...argv];
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});
it.each(["resolve", "agent", "review"])(
  "blocks public Codex subscription before artifacts or models in the %s entry point",
  async (phase) => {
    scratch = await mkdtemp(join(tmpdir(), "cloudfide-policy-"));
    const policy = activePolicy();
    policy.roles.analyst!.provider = "codex";
    policy.roles.writer!.provider = "claude";
    policy.roles.reviewer!.provider = "claude";
    const event = join(scratch, "event.json");
    await writeFile(event, JSON.stringify({ inputs: { pr: "2" } }));
    await writeFile(join(scratch, "config.json"), JSON.stringify(policy));
    vi.spyOn(process, "cwd").mockReturnValue(scratch);
    vi.stubEnv("GITHUB_EVENT_PATH", event);
    vi.stubEnv("GITHUB_REPOSITORY", "owner/repo");
    vi.stubEnv("GITHUB_RUN_ID", "123");
    vi.stubEnv("GITHUB_RUN_ATTEMPT", "1");
    vi.stubEnv("GITHUB_SHA", "c".repeat(40));
    vi.stubEnv("GITHUB_TOKEN", "fixture");
    vi.stubEnv("CONTEXT_JSON", undefined);
    vi.stubEnv("GITHUB_OUTPUT", join(scratch, "github-output"));
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: unknown) => {
      const path = new URL(String(input)).pathname;
      requests.push(path);
      let data: unknown;
      if (path === "/repos/owner/repo")
        data = { id: 1, private: false, default_branch: "main" };
      else if (path === "/repos/owner/repo/actions/runs/123")
        data = {
          id: 123,
          run_attempt: 1,
          workflow_id: 9,
          head_sha: "c".repeat(40),
          head_branch: "main",
          event: "workflow_dispatch",
          run_started_at: new Date().toISOString(),
        };
      else if (path === "/repos/owner/repo/pulls/2")
        data = {
          state: "open",
          user: { login: "karol" },
          base: { sha: "a".repeat(40) },
          head: { sha: "b".repeat(40), repo: { id: 1 } },
        };
      else throw new Error("unexpected external request: " + path);
      return new Response(JSON.stringify(data), { status: 200 });
    });
    process.argv[2] = phase;
    vi.resetModules();
    if (phase === "agent") {
      await import("../src/main.js");
      const payload = JSON.parse(
        await readFile(join(scratch, "output/payload.json"), "utf8"),
      );
      expect(payload.manifest.status).toBe("inconclusive");
      expect(payload.manifest.reason).toMatch(
        /Codex subscription.*private repository/,
      );
      expect(payload.manifest.calls).toEqual([]);
    } else {
      await expect(import("../src/main.js")).rejects.toThrow(
        /Codex subscription.*private repository/,
      );
    }
    expect(requests.every((path) => !path.includes("/artifacts"))).toBe(true);
    if (phase === "agent")
      expect(await readFile(join(scratch, "github-output"), "utf8")).toBe(
        "candidate=false\n",
      );
    else
      await expect(
        readFile(join(scratch, "github-output"), "utf8"),
      ).rejects.toMatchObject({ code: "ENOENT" });
  },
);
