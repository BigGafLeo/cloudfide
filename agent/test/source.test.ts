import { expect, it } from "vitest";
import { parseTreeEntry, snapshotPath } from "../src/source.js";
it("rejects links, executable blobs, traversal and confidential paths before materialization", () => {
  expect(snapshotPath("backend/src/config.ts")).toBe(true);
  expect(snapshotPath("frontend/src/test/setup.ts")).toBe(true);
  for (const p of [
    "../outside",
    "backend/.env",
    "backend/AGENTS.md",
    "assignment 4.md",
    ".git/config",
    "agent/src/main.ts",
  ])
    expect(snapshotPath(p)).toBe(false);
  expect(() =>
    parseTreeEntry("120000 blob " + "a".repeat(40) + "\tbackend/src/link.ts"),
  ).toThrow(/mode/);
  expect(() =>
    parseTreeEntry("100755 blob " + "a".repeat(40) + "\tbackend/src/run.ts"),
  ).toThrow(/mode/);
  expect(
    parseTreeEntry("100644 blob " + "a".repeat(40) + "\tbackend/src/config.ts"),
  ).toEqual("backend/src/config.ts");
});
