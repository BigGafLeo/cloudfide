import { expect, it } from "vitest";
import { classifyMutation } from "../src/mutation.js";
it("does not report a startup error or mutant runtime error as a killed bug", () => {
  expect(
    classifyMutation({ exitCode: 1, report: null, setupError: true }),
  ).toBe("error");
  expect(
    classifyMutation({ exitCode: 0, report: { files: {} }, setupError: false }),
  ).toBe("inconclusive");
  expect(
    classifyMutation({
      exitCode: 0,
      report: { files: { "src/a.ts": { mutants: [{ status: "RunError" }] } } },
      setupError: false,
    }),
  ).toBe("inconclusive");
  expect(
    classifyMutation({
      exitCode: 0,
      report: {
        files: {
          "src/a.ts": {
            mutants: [
              { status: "Killed" },
              { status: "Survived" },
              { status: "NoCoverage" },
              { status: "Timeout" },
            ],
          },
        },
      },
      setupError: false,
    }),
  ).toBe("passed");
});
