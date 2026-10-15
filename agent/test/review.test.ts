import { expect, it } from "vitest";
import { runReview } from "../src/review.js";
import {
  makeCandidate,
  makeVerification,
  activePolicy,
  completedNative,
} from "./support.js";
it("does not call a reviewer when disabled or required mechanical checks failed", async () => {
  const c = makeCandidate(),
    v = makeVerification(c),
    p = activePolicy();
  let calls = 0;
  const a = {
    id: "fixture",
    assertCapabilities: async () => {},
    run: async () => {
      calls++;
      return completedNative();
    },
  };
  expect(
    await runReview(
      c,
      v,
      p,
      new Map([["fixture", a]]),
      async () => true,
      new AbortController().signal,
      { patch: "fixture", files: [] },
    ),
  ).toBeNull();
  p.review.enabled = true;
  v.checks[0]!.status = "failed";
  expect(
    await runReview(
      c,
      v,
      p,
      new Map([["fixture", a]]),
      async () => true,
      new AbortController().signal,
      { patch: "fixture", files: [] },
    ),
  ).toBeNull();
  expect(calls).toBe(0);
});
it("uses a fresh selected provider and leaves arbitrary model claims unconfirmed", async () => {
  const c = makeCandidate(),
    v = makeVerification(c),
    p = activePolicy();
  p.review.enabled = true;
  p.roles.reviewer!.provider = "other";
  let prompt = "";
  const a = {
    id: "other",
    assertCapabilities: async () => {},
    run: async (request: any) => {
      prompt = request.prompt;
      return {
        ...completedNative(),
        result: {
          status: "failed",
          reason: "claim",
          findings: [
            {
              id: "f",
              severity: "material",
              location: "http.ts:1",
              claim: "claim",
              evidence: "model says",
              kind: "other",
              factId: null,
            },
          ],
        },
      };
    },
  };
  const r = await runReview(
    c,
    v,
    p,
    new Map([["other", a]]),
    async () => true,
    new AbortController().signal,
    { patch: "fixture", files: [] },
  );
  expect(r!.call.provider).toBe("other");
  expect(r!.confirmations).toEqual([]);
  expect(prompt).toContain("review-unit-tests");
  expect(prompt).not.toContain("write-unit-tests/SKILL");
});
