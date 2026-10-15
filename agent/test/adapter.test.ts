import { expect, it } from "vitest";
import { profileArgs, assertAttestation } from "../src/providers/cli.js";
it("refuses self-declared or wrong-profile conformance before paid launch", () => {
  expect(() =>
    assertAttestation("codex", {
      version: "0.162.1",
      verified: false,
      profileHash: "fake",
      platform: "linux",
    }),
  ).toThrow();
  expect(() =>
    assertAttestation("codex", {
      version: "0.162.1",
      verified: true,
      profileHash: "fake",
      platform: "linux",
    }),
  ).toThrow();
  expect(profileArgs("claude").includes("--restricted")).toBe(true);
});
