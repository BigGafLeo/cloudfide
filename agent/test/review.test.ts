import { expect, it } from "vitest";
import { runReview, buildReviewInput } from "../src/review.js";
import { limits } from "../src/contracts.js";
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
import { selectReviewFiles } from "../src/review.js";

it("includes a new test's real source, original neighboring tests and imported dependencies", () => {
  const plan = makeCandidate().plan!;
  const files = [
    {
      path: "frontend/src/lib/http.ts",
      content:
        "import { parse } from './parse.js'; export const request = parse;",
    },
    {
      path: "frontend/src/lib/parse.ts",
      content: "export const parse = () => 1;",
    },
    {
      path: "frontend/src/lib/http.other.test.ts",
      content:
        "import { request } from './http'; test('existing success', () => request());",
    },
    { path: "backend/src/unrelated.ts", content: "export const other = 1;" },
  ];
  const chosen = selectReviewFiles(files, plan).map((f) => f.path);
  expect(chosen).toContain("frontend/src/lib/http.ts");
  expect(chosen).toContain("frontend/src/lib/parse.ts");
  expect(chosen).toContain("frontend/src/lib/http.other.test.ts");
  expect(chosen).not.toContain("backend/src/unrelated.ts");
});

it("fails closed when a reviewed source or compared existing test is absent", () => {
  const plan = makeCandidate().plan!;
  expect(() => selectReviewFiles([], plan)).toThrow(
    /review source unavailable/,
  );
  plan.cases[0]!.value = {
    action: "strengthen",
    testPath: plan.paths[0]!,
    existingTests: [{ path: plan.paths[0]!, name: "existing 204" }],
    regression: "attempts to parse empty body",
    rationale: "response correctness with no added setup",
  };
  expect(() =>
    selectReviewFiles(
      [
        {
          path: "frontend/src/lib/http.ts",
          content: "export const request = () => {};",
        },
      ],
      plan,
    ),
  ).toThrow(/review existing test unavailable/);
});

it("reviews a compared test created in an earlier round and follows imports from proposed tests", () => {
  const plan = makeCandidate().plan!;
  const target = plan.paths[0]!;
  plan.cases[0]!.value = {
    ...plan.cases[0]!.value,
    action: "strengthen",
    existingTests: [{ path: target, name: "earlier generated 204" }],
  };
  const files = [
    {
      path: "frontend/src/lib/http.ts",
      content: "export const request=()=>undefined;",
    },
    {
      path: "frontend/src/test/assertRequest.ts",
      content: "export const assertEmpty=()=>true;",
    },
  ];
  const proposed = [
    {
      path: target,
      content:
        "import {request} from './http'; import {assertEmpty} from '../test/assertRequest'; test('earlier generated 204',()=>assertEmpty(request()));",
    },
  ];
  const chosen = selectReviewFiles(files, plan, proposed);
  expect(chosen.map((f) => f.path)).toContain(
    "frontend/src/test/assertRequest.ts",
  );
  expect(chosen.map((f) => f.path)).not.toContain(target); // exact candidate content remains in patch
  expect(() => selectReviewFiles(files, plan, [])).toThrow(
    /review existing test unavailable/,
  );
});

it("preserves original tests for comparison while following a proposed test's new imports", () => {
  const plan = makeCandidate().plan!,
    target = plan.paths[0]!;
  const files = [
    {
      path: "frontend/src/lib/http.ts",
      content: "export const request=()=>undefined;",
    },
    { path: target, content: "test('original 204',()=>{});" },
    {
      path: "frontend/src/test/assertRequest.ts",
      content: "export const assertEmpty=()=>true;",
    },
  ];
  const proposed = [
    {
      path: target,
      content:
        "import {assertEmpty} from '../test/assertRequest'; test('changed',()=>assertEmpty());",
    },
  ];
  const selected = selectReviewFiles(files, plan, proposed);
  expect(selected.find((f) => f.path === target)?.content).toBe(
    files[1]!.content,
  );
  expect(
    selected.some((f) => f.path === "frontend/src/test/assertRequest.ts"),
  ).toBe(true);
});

it("keeps helper evidence imported only by an original test as well as new imports", () => {
  const plan = makeCandidate().plan!,
    target = plan.paths[0]!;
  const files = [
    {
      path: "frontend/src/lib/http.ts",
      content: "export const request=()=>undefined;",
    },
    {
      path: target,
      content:
        "import {oldAssert} from '../test/oldAssert'; test('original',()=>oldAssert());",
    },
    {
      path: "frontend/src/test/oldAssert.ts",
      content: "export const oldAssert=()=>true;",
    },
    {
      path: "frontend/src/test/newAssert.ts",
      content: "export const newAssert=()=>true;",
    },
  ];
  const proposed = [
    {
      path: target,
      content:
        "import {newAssert} from '../test/newAssert'; test('changed',()=>newAssert());",
    },
  ];
  const selected = selectReviewFiles(files, plan, proposed);
  expect(selected.find((f) => f.path === target)?.content).toBe(
    files[1]!.content,
  );
  expect(selected.map((f) => f.path)).toEqual(
    expect.arrayContaining([
      "frontend/src/test/oldAssert.ts",
      "frontend/src/test/newAssert.ts",
    ]),
  );
});

it("reviews a cumulative package above the per-round bundle limit without removing evidence", async () => {
  const c = makeCandidate(),
    v = makeVerification(c),
    p = activePolicy();
  p.review = { enabled: true, gate: "required" };
  const source = {
    patch: "exact cumulative patch\n" + "x".repeat(220 * 1024),
    files: [
      {
        path: c.files[0]!,
        content: "original test with its original assertions",
      },
    ],
  };
  let captured: any;
  const adapter = {
    id: "fixture",
    assertCapabilities: async () => {},
    run: async (request: any) => {
      captured = JSON.parse(
        request.prompt.slice(request.prompt.lastIndexOf("\n") + 1),
      );
      return {
        ...completedNative(),
        result: { status: "passed", reason: "fixture review", findings: [] },
      };
    },
  };
  const reviewed = await runReview(
    c,
    v,
    p,
    new Map([["fixture", adapter]]),
    async () => true,
    new AbortController().signal,
    source,
  );
  expect(Buffer.byteLength(JSON.stringify(captured))).toBeGreaterThan(
    limits.bundle,
  );
  expect(captured.patch).toBe(source.patch);
  expect(captured.files).toEqual(source.files);
  expect(captured.plan).toEqual(c.plan);
  expect(captured.checks).toEqual(v.checks);
  expect(reviewed?.call.status).toBe("completed");
  expect(reviewed?.result.status).toBe("passed");
});

it("counts UTF-8 bytes and refuses an oversized review before any provider access", async () => {
  const c = makeCandidate(),
    v = makeVerification(c),
    p = activePolicy();
  p.review = { enabled: true, gate: "required" };
  const patch = "ż".repeat(300 * 1024);
  let capabilities = 0,
    calls = 0;
  const adapter = {
    id: "fixture",
    assertCapabilities: async () => {
      capabilities++;
    },
    run: async () => {
      calls++;
      return completedNative();
    },
  };
  expect(patch.length).toBeLessThan(limits.reviewBundle);
  await expect(
    runReview(
      c,
      v,
      p,
      new Map([["fixture", adapter]]),
      async () => true,
      new AbortController().signal,
      { patch, files: [] },
    ),
  ).rejects.toThrow(/review context bounds:.*bytes.*524288/);
  expect(capabilities).toBe(0);
  expect(calls).toBe(0);
});

it("accepts the exact review byte limit and rejects one additional byte", () => {
  const c = makeCandidate(),
    v = makeVerification(c);
  const base = buildReviewInput(c, v, { patch: "", files: [] });
  const patch = "x".repeat(
    limits.reviewBundle - Buffer.byteLength(JSON.stringify(base)),
  );
  const atLimit = buildReviewInput(c, v, { patch, files: [] });
  expect(Buffer.byteLength(JSON.stringify(atLimit))).toBe(limits.reviewBundle);
  expect(() =>
    buildReviewInput(c, v, { patch: patch + "x", files: [] }),
  ).toThrow(/review context bounds/);
});
