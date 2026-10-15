import { afterEach, expect, it, vi } from "vitest";
import { launchNative } from "../src/providers/cli.js";
import { activePolicy } from "./support.js";
import type { RoleRequest } from "../src/contracts.js";
const { processResult } = vi.hoisted(() => ({ processResult: vi.fn() }));
vi.mock("../src/providers/process.js", () => ({ runProcess: processResult }));
const token = "fixture-oauth-private-value";
const request: RoleRequest = {
  callId: "error-fixture",
  role: "analyst",
  model: "fixture",
  prompt: "fixture",
  schema: { type: "object" },
  allocationUsd: 1,
  timeoutMs: 1000,
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
function launch() {
  vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", token);
  return launchNative(
    "claude",
    "fixture-binary",
    request,
    activePolicy(),
    new AbortController().signal,
  );
}
it("preserves Claude's structured CLI failure instead of hiding it behind an exit code", async () => {
  processResult.mockResolvedValue({
    exitCode: 1,
    stderr: "",
    stdout: JSON.stringify({
      type: "result",
      is_error: true,
      result: "Not logged in. Please run /login",
    }),
  });
  await expect(launch()).rejects.toThrow(
    "native exit 1: Not logged in. Please run /login",
  );
});
it("redacts subscription credentials after decoding a structured error", async () => {
  const encoded = [...token]
    .map((c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"))
    .join("");
  processResult.mockResolvedValue({
    exitCode: 1,
    stderr: "",
    stdout: JSON.stringify({
      type: "result",
      is_error: true,
      result: "Invalid credential " + token,
    }).replace(token, encoded),
  });
  const error = await launch().catch((e: Error) => e);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain("Invalid credential [REDACTED]");
  expect((error as Error).message).not.toContain(token);
});
it("bounds and flattens stderr diagnostics while redacting credentials", async () => {
  processResult.mockResolvedValue({
    exitCode: 1,
    stdout: "not JSON",
    stderr: token + "\n" + "x".repeat(4000),
  });
  const error = await launch().catch((e: Error) => e);
  const message = (error as Error).message;
  expect(message).toContain("native exit 1: [REDACTED]");
  expect(message).not.toContain(token);
  expect(message).not.toMatch(/[\r\n\u001b]/);
  expect(message.length).toBeLessThanOrEqual("native exit 1: ".length + 1024);
});
