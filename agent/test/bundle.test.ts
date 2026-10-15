import { expect, it } from "vitest";
import { selectContextFiles } from "../src/bundle.js";
it("balances coverage-gap context across both apps and prioritizes small unit boundaries", () => {
  const paths = [
    "frontend/src/main.ts",
    "frontend/src/lib/http.ts",
    "frontend/src/utils/a.ts",
    "backend/src/main.ts",
    "backend/src/core/config.ts",
  ];
  const files = paths.map((path) => ({
    path,
    content: "export const value=1;",
  }));
  const chosen = selectContextFiles(
    files,
    [],
    paths.flatMap((p) => Array.from({ length: 10 }, (_, n) => p + ":" + n)),
    "coverage-gap",
  );
  expect(chosen.some((f) => f.path === "backend/src/core/config.ts")).toBe(
    true,
  );
  expect(chosen.some((f) => f.path === "frontend/src/lib/http.ts")).toBe(true);
});

it("rotates tried coverage units before retrying helpers and keeps PR selection scoped", () => {
  const paths = [
    "frontend/src/router.ts",
    "frontend/src/hooks/mutation.ts",
    "frontend/src/forms/save.ts",
    "frontend/src/factory.ts",
    "frontend/src/utils/a.ts",
  ];
  const files = paths.map((path) => ({
    path,
    content: "export const value=1",
  }));
  const gaps = paths.map((p) => p + ":1");
  expect(
    selectContextFiles(files, [], gaps, "coverage-gap").map((f) => f.path),
  ).toEqual(paths.slice(0, 4));
  expect(
    selectContextFiles(files, [], gaps, "coverage-gap", paths.slice(0, 4)).map(
      (f) => f.path,
    )[0],
  ).toBe("frontend/src/utils/a.ts");
  expect(
    selectContextFiles(
      files,
      ["frontend/src/factory.ts"],
      gaps,
      "pr-change",
      paths,
    ).map((f) => f.path),
  ).toEqual(["frontend/src/factory.ts"]);
});
