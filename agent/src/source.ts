import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { git, scratch, removeScratch } from "./workspace.js";
import { shaSchema, type RunContext, type FileData } from "./contracts.js";
export function snapshotPath(path: string): boolean {
  return (
    /^(backend|frontend)\/[A-Za-z0-9_./-]+$/.test(path) &&
    !path.split("/").some((p) => p === ".." || p === "." || p === "") &&
    !/(?:^|\/)(?:AGENTS\.md|CLAUDE\.md|SKILL\.md|\.git|\.claude|\.codex|\.agents|node_modules|dist|coverage|assignment[^/]*\.md|\.env(?:\..*)?)(?:\/|$)/i.test(
      path,
    ) &&
    /\.(?:tsx?|[cm]?js|json|prisma|svg|css|html|md)$/.test(path)
  );
}
export function parseTreeEntry(entry: string): string {
  const match =
    /^(100644|100755|120000|160000) (blob|commit) ([a-f0-9]{40})\t(.+)$/.exec(
      entry,
    );
  if (!match || match[1] !== "100644" || match[2] !== "blob")
    throw new Error("unsupported source blob mode");
  return match[4]!;
}
export interface SourceSnapshots {
  head: string;
  base: string;
  files: FileData[];
  changed: string[];
  diff: string;
  cleanup(): Promise<void>;
}
export async function fetchSnapshots(
  context: RunContext,
  signal: AbortSignal,
): Promise<SourceSnapshots> {
  shaSchema.parse(context.headSha);
  shaSchema.parse(context.baseSha);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(context.repository))
    throw new Error("repository bounds");
  const root = await scratch("source"),
    head = join(root, "head"),
    base = join(root, "base"),
    repo = join(root, "repo");
  try {
    await mkdir(repo);
    await mkdir(head);
    await mkdir(base);
    await git(repo, ["init", "--quiet"]);
    await git(
      repo,
      [
        "fetch",
        "--quiet",
        "--no-tags",
        "--depth=1",
        "https://github.com/" + context.repository + ".git",
        context.baseSha,
        context.headSha,
      ],
      "",
      signal,
    );
    const files: FileData[] = [];
    let bytes = 0;
    for (const [sha, destination] of [
      [context.baseSha, base],
      [context.headSha, head],
    ] as const) {
      const entries = (
        await git(repo, ["ls-tree", "--full-tree", "-r", "-z", sha], "", signal)
      )
        .split("\0")
        .filter(Boolean);
      if (entries.length > 2000) throw new Error("source tree bounds");
      for (const entry of entries) {
        const path = entry.slice(entry.indexOf("\t") + 1);
        if (!snapshotPath(path)) continue;
        parseTreeEntry(entry);
        const content = await git(repo, ["show", sha + ":" + path], "", signal);
        bytes += Buffer.byteLength(content);
        if (bytes > 4 * 1024 * 1024 || Buffer.byteLength(content) > 512 * 1024)
          throw new Error("source bytes bounds");
        await mkdir(dirname(join(destination, path)), { recursive: true });
        await writeFile(join(destination, path), content, { mode: 0o644 });
        if (sha === context.headSha) files.push({ path, content });
      }
    }
    const changed = (
      await git(
        repo,
        [
          "diff",
          "--name-only",
          "--no-ext-diff",
          "--no-textconv",
          context.baseSha,
          context.headSha,
          "--",
          "backend",
          "frontend",
        ],
        "",
        signal,
      )
    )
      .trim()
      .split("\n")
      .filter(Boolean);
    const diff = await git(
      repo,
      [
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        context.baseSha,
        context.headSha,
        "--",
        "backend",
        "frontend",
      ],
      "",
      signal,
    );
    return {
      head,
      base,
      files,
      changed,
      diff,
      cleanup: () => removeScratch(root),
    };
  } catch (error) {
    await removeScratch(root);
    throw error;
  }
}
