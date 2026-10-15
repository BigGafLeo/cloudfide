import { lstat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
export function validatePatchPath(path: string): void {
  if (
    !/^[A-Za-z0-9_./-]+$/.test(path) ||
    path.startsWith("/") ||
    path
      .split("/")
      .some((p) => !p || p === "." || p === ".." || p.startsWith("."))
  )
    throw new Error("unsafe patch path");
  const segments = path.split("/");
  if (
    segments.some((p) =>
      /^(?:AGENTS\.md|CLAUDE\.md|SKILL\.md|assignment.*\.md|package(?:-lock)?\.json|.*\.config\.[a-z]+)$/i.test(
        p,
      ),
    )
  )
    throw new Error("instruction/config path forbidden");
  const allowed =
    /^backend\/tests\/(?:.*\/)?[^/]+\.test\.ts$/.test(path) ||
    /^frontend\/src\/(?:.*\/)?[^/]+\.test\.tsx?$/.test(path) ||
    /^backend\/tests\/fixtures\/.+/.test(path) ||
    /^frontend\/src\/test\/fixtures\/.+/.test(path) ||
    path === "frontend/src/test/todoFixture.ts";
  if (!allowed || path === "frontend/src/test/setup.ts")
    throw new Error("patch scope forbidden");
}
export async function assertSafeTarget(
  root: string,
  path: string,
): Promise<void> {
  validatePatchPath(path);
  const target = resolve(root, path),
    base = resolve(root);
  if (!target.startsWith(base + sep)) throw new Error("path escapes workspace");
  let current = base;
  for (const part of ["", ...path.split("/")]) {
    if (part) current = join(current, part);
    let stat;
    try {
      stat = await lstat(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (stat.isSymbolicLink() || (!stat.isDirectory() && stat.nlink > 1))
      throw new Error("link path forbidden");
  }
}
