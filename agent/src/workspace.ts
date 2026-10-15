import {
  mkdtemp,
  readdir,
  lstat,
  mkdir,
  readFile,
  writeFile,
  rm,
  realpath,
} from "node:fs/promises";
import { join, resolve, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { runProcess } from "./providers/process.js";
export async function scratch(name: string): Promise<string> {
  return mkdtemp(join(tmpdir(), "cloudfide-" + name + "-"));
}
export async function removeScratch(root: string): Promise<void> {
  const actual = await realpath(root),
    parent = await realpath(tmpdir());
  if (dirname(actual) !== parent || !basename(actual).startsWith("cloudfide-"))
    throw new Error("unsafe scratch cleanup");
  await rm(actual, { recursive: true, force: true });
}
export async function copySnapshot(
  from: string,
  to: string,
  relative = "",
): Promise<void> {
  const ignore = new Set([
    ".git",
    "node_modules",
    "dist",
    "coverage",
    ".superpowers",
    ".worktrees",
    ".agents",
    ".claude",
    ".codex",
  ]);
  for (const entry of await readdir(join(from, relative), {
    withFileTypes: true,
  })) {
    if (
      ignore.has(entry.name) ||
      ["AGENTS.md", "CLAUDE.md", "SKILL.md"].includes(entry.name) ||
      /^assignment.*\.md$/i.test(entry.name) ||
      (/^\.env/.test(entry.name) && entry.name !== ".env.example")
    )
      continue;
    const path = relative ? relative + "/" + entry.name : entry.name;
    const info = await lstat(join(from, path));
    if (info.isSymbolicLink() || (!info.isDirectory() && info.nlink > 1))
      throw new Error("snapshot link unsupported");
    if (info.isDirectory()) {
      await mkdir(join(to, path), { recursive: true });
      await copySnapshot(from, to, path);
    } else if (info.isFile()) {
      await mkdir(dirname(join(to, path)), { recursive: true });
      await writeFile(join(to, path), await readFile(join(from, path)), {
        mode: 0o644,
      });
    }
  }
}
export async function git(
  root: string,
  args: string[],
  stdin = "",
  signal = new AbortController().signal,
): Promise<string> {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? process.env.USERPROFILE ?? tmpdir(),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
  };
  if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
  const out = await runProcess(
    "git",
    [
      "-c",
      "safe.directory=" + resolve(root),
      "-c",
      "core.hooksPath=" + join(root, ".disabled-hooks"),
      ...args,
    ],
    { cwd: root, env, stdin, maxBytes: 4 * 1024 * 1024, timeoutMs: 30000 },
    signal,
  );
  if (out.exitCode !== 0) throw new Error("git command failed: " + args[0]);
  return out.stdout;
}
export async function initIndex(root: string): Promise<void> {
  await git(root, ["init", "--quiet"]);
  await git(root, ["add", "--force", "--all"]);
}
