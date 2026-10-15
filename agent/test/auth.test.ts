import { expect, it } from "vitest";
import { selectAuth } from "../src/providers/auth.js";
it("defaults to subscription and never falls back to a present API key", () => {
  expect(() =>
    selectAuth("claude", undefined, { ANTHROPIC_API_KEY: "fixture" }),
  ).toThrow(/subscription/);
  expect(() =>
    selectAuth("codex", undefined, { OPENAI_API_KEY: "fixture" }),
  ).toThrow(/subscription/);
  expect(
    selectAuth("claude", "subscription", {
      CLAUDE_CODE_OAUTH_TOKEN: "fixture",
    }),
  ).toEqual({
    mode: "subscription",
    environment: { CLAUDE_CODE_OAUTH_TOKEN: "fixture" },
  });
  expect(
    selectAuth("codex", "subscription", {
      CODEX_SUBSCRIPTION_HOME: "/private/session",
    }),
  ).toEqual({
    mode: "subscription",
    codexHome: "/private/session",
    environment: {},
  });
});
it("API auth requires explicit selection and the matching credential only", () => {
  expect(
    selectAuth("claude", "api", {
      ANTHROPIC_API_KEY: "fixture",
      CLAUDE_CODE_OAUTH_TOKEN: "other",
    }),
  ).toEqual({ mode: "api", environment: { ANTHROPIC_API_KEY: "fixture" } });
  expect(() =>
    selectAuth("claude", "api", { OPENAI_API_KEY: "fixture" }),
  ).toThrow(/API/);
});
import { leaseCodexAuth } from "../src/providers/auth.js";
import { scratch, removeScratch } from "../src/workspace.js";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
it("serializes dedicated Codex sessions and writes refreshed credentials back privately", async () => {
  const root = await scratch("test-auth"),
    source = join(root, "dedicated"),
    first = join(root, "first"),
    second = join(root, "second");
  try {
    for (const p of [source, first, second]) await mkdir(p);
    await writeFile(
      join(source, "auth.json"),
      JSON.stringify({
        auth_mode: "chatgpt",
        tokens: { refresh_token: "fixture-old" },
      }),
    );
    const release = await leaseCodexAuth(source, first);
    await expect(leaseCodexAuth(source, second)).rejects.toThrow();
    await writeFile(
      join(first, "auth.json"),
      JSON.stringify({
        auth_mode: "chatgpt",
        tokens: { refresh_token: "fixture-refreshed" },
      }),
    );
    await release();
    expect(
      JSON.parse(await readFile(join(source, "auth.json"), "utf8")).tokens
        .refresh_token,
    ).toBe("fixture-refreshed");
    const next = await leaseCodexAuth(source, second);
    await next();
  } finally {
    await removeScratch(root);
  }
});
