import { hostname } from "node:os";
import {
  readFile,
  writeFile,
  open,
  rename,
  unlink,
  lstat,
  realpath,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
export type AuthMode = "subscription" | "api";
export interface AuthSelection {
  mode: AuthMode;
  environment: Record<string, string>;
  codexHome?: string;
}
export function selectAuth(
  id: "codex" | "claude",
  mode: AuthMode = "subscription",
  env: NodeJS.ProcessEnv = process.env,
): AuthSelection {
  if (mode === "subscription") {
    if (id === "claude" && env.CLAUDE_CODE_OAUTH_TOKEN)
      return {
        mode,
        environment: { CLAUDE_CODE_OAUTH_TOKEN: env.CLAUDE_CODE_OAUTH_TOKEN },
      };
    if (id === "codex" && env.CODEX_SUBSCRIPTION_HOME)
      return { mode, codexHome: env.CODEX_SUBSCRIPTION_HOME, environment: {} };
    throw new Error("Missing dedicated subscription credential for " + id);
  }
  const key =
    id === "codex"
      ? (env.CODEX_API_KEY ?? env.OPENAI_API_KEY)
      : env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Missing explicit API credential for " + id);
  return {
    mode,
    environment: {
      [id === "codex" ? "CODEX_API_KEY" : "ANTHROPIC_API_KEY"]: key,
    },
  };
}
export async function leaseCodexAuth(
  sourceHome: string,
  isolatedHome: string,
): Promise<() => Promise<void>> {
  const home = await realpath(sourceHome),
    source = join(home, "auth.json");
  if (home !== resolve(sourceHome))
    throw new Error("credential home must be an absolute real path");
  const stat = await lstat(source);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    stat.size > 131072
  )
    throw new Error("invalid credential file");
  // One dedicated session stream. Never use the interactive desktop/CLI home here.
  const lock = await open(join(home, ".cloudfide-auth.lock"), "wx", 0o600);
  try {
    const bytes = await readFile(source),
      data = JSON.parse(bytes.toString());
    if (data.auth_mode !== "chatgpt" || !data.tokens?.refresh_token)
      throw new Error("ChatGPT managed credentials required");
    await writeFile(join(isolatedHome, "auth.json"), bytes, { mode: 0o600 });
  } catch (error) {
    await lock.close();
    await unlink(join(home, ".cloudfide-auth.lock"));
    throw error;
  }
  return async () => {
    const pending = join(home, ".cloudfide-auth-" + randomUUID() + ".json");
    try {
      const bytes = await readFile(join(isolatedHome, "auth.json"));
      if (bytes.byteLength > 131072)
        throw new Error("refreshed credential bounds");
      const data = JSON.parse(bytes.toString());
      if (data.auth_mode !== "chatgpt" || !data.tokens?.refresh_token)
        throw new Error("invalid refreshed credentials");
      await writeFile(pending, bytes, { mode: 0o600 });
      await rename(pending, source);
    } finally {
      await unlink(pending).catch(() => {});
      await lock.close();
      await unlink(join(home, ".cloudfide-auth.lock"));
    }
  };
}
