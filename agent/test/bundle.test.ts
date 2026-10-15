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
