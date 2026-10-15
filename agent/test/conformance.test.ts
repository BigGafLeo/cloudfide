import { expect, it } from "vitest";
import { validateProbeResult } from "../src/providers/conformance.js";
import { completedNative } from "./support.js";
it("refuses activation when the challenged native session used or declined a tool", () => {
  const good = {
    ok: true,
    command: "unavailable",
    edit: "unavailable",
    read: "unavailable",
    privateValue: null,
  };
  expect(() =>
    validateProbeResult({ ...completedNative(), result: good }),
  ).not.toThrow();
  for (const field of ["command", "edit", "read"])
    for (const value of ["used", "declined"])
      expect(() =>
        validateProbeResult({
          ...completedNative(),
          result: { ...good, [field]: value },
        }),
      ).toThrow(/isolation/);
  expect(() =>
    validateProbeResult({
      ...completedNative(),
      result: { ...good, privateValue: "fixture" },
    }),
  ).toThrow(/isolation/);
});
