import { afterEach, expect, it, vi } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { launchNative } from "../src/providers/cli.js";
import { normalizeCodex } from "../src/providers/native.js";
import { restrictCodexCatalog } from "../src/providers/codex-catalog.js";
import { activePolicy } from "./support.js";
import type { RoleRequest } from "../src/contracts.js";
const { processResult } = vi.hoisted(() => ({ processResult: vi.fn() }));
vi.mock("../src/providers/process.js", () => ({ runProcess: processResult }));
const line = (value: unknown) => JSON.stringify(value) + "\n";
const final = '{"ok":true}';
const stream =
  line({
    type: "item.completed",
    item: { type: "agent_message", text: "Checking the supplied context." },
  }) +
  line({
    type: "item.completed",
    item: { type: "agent_message", text: final },
  }) +
  line({
    type: "turn.completed",
    usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 3 },
  });
const normalize = normalizeCodex as (
  jsonl: string,
  rates: undefined,
  finalText: string,
) => ReturnType<typeof normalizeCodex>;
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("uses the CLI final-response file when JSONL includes commentary", () => {
  const result = normalize(stream, undefined, final);
  expect(result.result).toEqual({ ok: true });
  expect(result.usage?.inputTokens).toBe(10);
});
it("rejects a final-response file that disagrees with the last streamed message", () => {
  const one =
    line({
      type: "item.completed",
      item: { type: "agent_message", text: final },
    }) + line({ type: "turn.completed" });
  expect(() => normalize(one, undefined, '{"ok":false}')).toThrow(/final/);
});
it("rejects MCP calls even when a valid final-response file exists", () => {
  expect(() =>
    normalize(
      line({
        type: "item.completed",
        item: {
          type: "mcp_tool_call",
          server: "codex",
          tool: "list_mcp_resources",
        },
      }) + stream,
      undefined,
      final,
    ),
  ).toThrow(/tool/);
});
it("rejects messages after the completed turn", () => {
  const one =
    line({ type: "turn.completed" }) +
    line({
      type: "item.completed",
      item: { type: "agent_message", text: final },
    });
  expect(() => normalize(one, undefined, final)).toThrow(/final|completed/);
});
it("launches Codex with a restricted bundled catalog and a bounded final-response artifact", async () => {
  vi.stubEnv("CODEX_API_KEY", "fixture-unit-key");
  const model = {
    slug: "fixture",
    tool_mode: "code_mode_only",
    shell_type: "unified_exec",
    apply_patch_tool_type: "freeform",
    experimental_supported_tools: ["clock", "send_user_message_async"],
    supports_search_tool: true,
    guardian: { scope: "fixture-preserve" },
    context_window: 10000,
  };
  processResult.mockImplementation(
    async (
      _binary: string,
      args: string[],
      options: { env: Record<string, string> },
    ) => {
      if (args[0] === "debug") {
        expect(args).toEqual(["debug", "models", "--bundled"]);
        expect(options.env.CODEX_API_KEY).toBeUndefined();
        expect(options.env.OPENAI_API_KEY).toBeUndefined();
        return {
          exitCode: 0,
          stdout: JSON.stringify({ models: [model] }),
          stderr: "",
        };
      }
      const output = args[args.indexOf("--output-last-message") + 1];
      if (!args.includes("--output-last-message") || !output)
        throw new Error("Codex must request a final response file");
      const config = args.find((a) => a.startsWith("model_catalog_json="));
      if (!config)
        throw new Error("Codex must use the restricted bundled catalog");
      const catalog = JSON.parse(
        await readFile(
          JSON.parse(config.slice("model_catalog_json=".length)),
          "utf8",
        ),
      );
      expect(catalog.models).toEqual([
        {
          ...model,
          tool_mode: "direct",
          shell_type: "disabled",
          apply_patch_tool_type: null,
          experimental_supported_tools: [],
          supports_search_tool: false,
          node_repl_disabled: true,
        },
      ]);
      expect(args).toContain("project_doc_max_bytes=0");
      for (const feature of [
        "goals",
        "sleep_tool",
        "tool_suggest",
        "image_generation",
        "hooks",
        "skill_search",
        "code_mode",
        "code_mode_only",
      ]) {
        expect(
          args.some(
            (arg, index) => arg === "--disable" && args[index + 1] === feature,
          ),
        ).toBe(true);
      }
      await writeFile(output, final + "\n");
      return { exitCode: 0, stdout: stream, stderr: "" };
    },
  );
  const policy = activePolicy();
  policy.roles.analyst = {
    ...policy.roles.analyst!,
    provider: "codex",
    auth: "api",
    model: "fixture",
  };
  const request: RoleRequest = {
    callId: "fixture",
    role: "analyst",
    model: "fixture",
    prompt: "fixture",
    schema: { type: "object" },
    timeoutMs: 5000,
    allocationUsd: 1,
  };
  const result = await launchNative(
    "codex",
    "fixture-binary",
    request,
    policy,
    new AbortController().signal,
  );
  expect(result.status).toBe("completed");
  expect(result.result).toEqual({ ok: true });
});

it.each([
  { models: [] },
  { models: [{ slug: "other" }] },
  { models: [{ slug: "fixture" }, { slug: "fixture" }] },
])(
  "rejects unavailable or ambiguous bundled models without selecting a fallback",
  (catalog) => {
    expect(() =>
      restrictCodexCatalog(JSON.stringify(catalog), "fixture"),
    ).toThrow(/exactly once/);
  },
);
it("rejects an invalid bundled catalog", () => {
  expect(() => restrictCodexCatalog('{"models":[null]}', "fixture")).toThrow();
});
