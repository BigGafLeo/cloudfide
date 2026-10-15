import { expect, it } from "vitest";
import { runProcess } from "../src/providers/process.js";
import { normalizeCodex, normalizeClaude } from "../src/providers/native.js";
import { fileURLToPath } from "node:url";
const child = fileURLToPath(
  new URL("./fixtures/native-child.mjs", import.meta.url),
);
it("bounds stdout, aborts a process tree and redacts credentials", async () => {
  const options = {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH!, CODEX_API_KEY: "fixture-secret-123" },
    stdin: "",
    maxBytes: 1000,
    timeoutMs: 3000,
  };
  const redacted = await runProcess(
    process.execPath,
    [child, "secret"],
    options,
    new AbortController().signal,
  );
  expect(redacted.stdout).not.toContain("fixture-secret-123");
  await expect(
    runProcess(
      process.execPath,
      [child, "flood"],
      options,
      new AbortController().signal,
    ),
  ).rejects.toThrow(/output/);
  await expect(
    runProcess(
      process.execPath,
      [child, "hang"],
      { ...options, timeoutMs: 150 },
      new AbortController().signal,
    ),
  ).rejects.toThrow(/timeout/);
});
it("uses only final cumulative usage and rejects execution or duplicate finals", () => {
  const line = (x: unknown) => JSON.stringify(x) + "\n";
  const good =
    line({
      type: "item.completed",
      item: { type: "agent_message", text: '{"ok":true}' },
    }) +
    line({
      type: "turn.completed",
      usage: { input_tokens: 10, cached_input_tokens: 4, output_tokens: 2 },
    });
  expect(
    normalizeCodex(good, { input: 1, cached: 0.5, output: 2 }).usage
      ?.estimatedUsd,
  ).toBe(0.000012);
  expect(() =>
    normalizeCodex(
      good +
        line({
          type: "turn.completed",
          usage: { input_tokens: 10, output_tokens: 2 },
        }),
    ),
  ).toThrow();
  expect(() =>
    normalizeCodex(
      line({
        type: "item.completed",
        item: { type: "command_execution", command: "evil" },
      }) + good,
    ),
  ).toThrow(/tool/);
  expect(
    normalizeClaude(
      JSON.stringify({
        type: "result",
        is_error: false,
        structured_output: { ok: true },
        usage: {
          input_tokens: 5,
          cache_read_input_tokens: 3,
          cache_creation_input_tokens: 2,
          output_tokens: 1,
        },
        total_cost_usd: 0.2,
      }),
    ).usage?.inputTokens,
  ).toBe(10);
  expect(() => normalizeClaude('{"type":"result","is_error":true}')).toThrow();
});

it("fails closed on unknown native event protocols", () => {
  const line = (x: unknown) => JSON.stringify(x) + "\n";
  const good =
    line({
      type: "item.completed",
      item: { type: "agent_message", text: '{"ok":true}' },
    }) + line({ type: "turn.completed" });
  expect(() =>
    normalizeCodex(
      line({ type: "new_execution_protocol", command: "evil" }) + good,
    ),
  ).toThrow(/event/);
});
