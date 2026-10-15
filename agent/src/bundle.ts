import {
  limits,
  type AnalysisBundle,
  type RunContext,
  type FileData,
  type CoverageReport,
  type CheckResult,
} from "./contracts.js";
export interface CollectedSummary {
  coverage: CoverageReport;
  checks: CheckResult[];
  complete: boolean;
}
export function buildBundle(
  context: RunContext,
  evidence: CollectedSummary,
  files: FileData[],
  diff: string,
): AnalysisBundle {
  const missingCritical: string[] = [];
  if (!evidence.complete)
    missingCritical.push("mechanical evidence incomplete");
  const selected: FileData[] = [];
  let bytes = Buffer.byteLength(JSON.stringify({ context, evidence, diff }));
  if (bytes > limits.bundle) {
    missingCritical.push("diff/evidence exceeds bundle limit");
    diff = "";
  }
  for (const file of files) {
    if (
      /(?:^|\/)(?:AGENTS\.md|CLAUDE\.md|SKILL\.md|assignment.*\.md|\.env(?:\..*)?|\.git|\.codex|\.claude|\.agents)(?:\/|$)/i.test(
        file.path,
      )
    )
      continue;
    const size = Buffer.byteLength(JSON.stringify(file));
    if (bytes + size > limits.bundle) {
      missingCritical.push(file.path + " exceeds context limit");
      continue;
    }
    selected.push(file);
    bytes += size;
  }
  if (!selected.length) missingCritical.push("no relevant source/tests");
  return { context, diff, files: selected, evidence, missingCritical };
}
export function selectContextFiles(
  files: FileData[],
  changed: string[],
  gaps: string[],
  task: "pr-change" | "coverage-gap",
  attempted: string[] = [],
): FileData[] {
  const byPath = new Map(files.map((f) => [f.path, f])),
    selected = new Set<string>();
  const units =
    task === "coverage-gap"
      ? selectCoverageUnits(files, gaps, attempted)
      : changed.filter((p) => /\.(ts|tsx)$/.test(p));
  for (const path of units) {
    if (!/^(backend|frontend)\//.test(path) || !byPath.has(path)) continue;
    selected.add(path);
    const stem = path.replace(/\.(tsx?|test\.tsx?)$/, "");
    for (const f of files)
      if (
        f.path === stem + ".test.ts" ||
        f.path === stem + ".test.tsx" ||
        (/\.test\.tsx?$/.test(f.path) &&
          f.content.includes(
            path
              .split("/")
              .pop()!
              .replace(/\.tsx?$/, ""),
          ))
      )
        selected.add(f.path);
  }
  for (const path of [...selected]) {
    const content = byPath.get(path)!.content;
    for (const match of content.matchAll(
      /(?:from\s+|import\s*(?:\(\s*)?)['"]([^'"]+)['"]/g,
    )) {
      const specifier = match[1]!;
      if (!specifier.startsWith(".")) continue;
      const parts = path.split("/");
      parts.pop();
      for (const part of specifier.split("/")) {
        if (part === "..") parts.pop();
        else if (part !== ".") parts.push(part);
      }
      const target = parts.join("/").replace(/\.js$/, "");
      for (const extension of [".ts", ".tsx", "/index.ts", ""])
        if (byPath.has(target + extension)) selected.add(target + extension);
    }
  }
  return [...selected].map((p) => byPath.get(p)!).filter(Boolean);
}
export function selectCoverageUnits(
  files: FileData[],
  gaps: string[],
  attempted: string[] = [],
): string[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const attempts = new Map<string, number>();
  for (const path of attempted)
    attempts.set(path, (attempts.get(path) ?? 0) + 1);
  function priority(path: string): number {
    if (/router|routes/i.test(path)) return 0;
    if (/hook|mutation|cache/i.test(path)) return 1;
    if (
      /form|save|delete|toggle/i.test(path) ||
      /onError|catch\s*\(/.test(byPath.get(path)?.content ?? "")
    )
      return 2;
    if (/factory|lifecycle|app\.ts/i.test(path)) return 3;
    return 4;
  }
  return (["backend", "frontend"] as const).flatMap((app) =>
    [
      ...new Set(
        gaps
          .map((g) => g.replace(/:\d+(?::\d+)?$/, ""))
          .filter(
            (p) =>
              p.startsWith(app + "/") &&
              byPath.has(p) &&
              !/\.test\.tsx?$/.test(p),
          ),
      ),
    ]
      .sort(
        (a, b) =>
          (attempts.get(a) ?? 0) - (attempts.get(b) ?? 0) ||
          priority(a) - priority(b) ||
          a.localeCompare(b),
      )
      .slice(0, 4),
  );
}
