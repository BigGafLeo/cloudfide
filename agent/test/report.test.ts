import { compareCoverage } from "../src/coverage.js";
import { expect, it } from "vitest";
import { decide, renderReport } from "../src/report.js";
import {
  makeCandidate,
  makeVerification,
  makeReview,
  activePolicy,
} from "./support.js";
it("never accepts completed generation without all required candidate checks", () => {
  const c = makeCandidate(),
    v = makeVerification(c),
    p = activePolicy();
  expect(decide(c, null, null, p)).toBe("inconclusive");
  v.checks = v.checks.filter((x) => x.id !== "frontend:unit");
  expect(decide(c, v, null, p)).toBe("inconclusive");
  v.checks = makeVerification(c).checks;
  v.checks[0]!.status = "failed";
  expect(decide(c, v, null, p)).toBe("failed");
});
it("keeps advisory claims nonblocking and required unconfirmed material inconclusive", () => {
  const c = makeCandidate(),
    v = makeVerification(c),
    r = makeReview(c),
    p = activePolicy();
  p.review.enabled = true;
  r.result.status = "failed";
  r.result.findings = [
    {
      id: "r1",
      severity: "material",
      location: "http.test.ts:1",
      claim: "wrong oracle",
      evidence: "source claim",
      kind: "oracle-counterexample",
      factId: null,
    },
  ];
  expect(decide(c, v, r, p)).toBe("accepted");
  p.review.gate = "required";
  expect(decide(c, v, r, p)).toBe("inconclusive");
  v.facts = [
    {
      id: "f1",
      kind: "oracle-counterexample",
      location: "http.test.ts:1",
      evidenceRef: "controlled.json",
    },
  ];
  r.result.findings[0]!.factId = "f1";
  r.confirmations = [{ findingId: "r1", factId: "f1" }];
  p.review.gate = "advisory";
  expect(decide(c, v, r, p)).toBe("failed");
});
it("rejects stale review and escapes untrusted report instructions/images", () => {
  const c = makeCandidate(),
    v = makeVerification(c),
    r = makeReview(c),
    p = activePolicy();
  r.patchSha256 = "e".repeat(64);
  expect(decide(c, v, r, p)).toBe("error");
  c.plan!.reason =
    '<img src="https://evil.invalid">@everyone [click](https://evil.invalid)';
  const report = renderReport({
    candidate: c,
    verification: v,
    review: null,
    decision: "accepted",
    runUrl: "https://github.com/owner/repo/actions/runs/123",
  });
  expect(report).not.toContain("<img");
  expect(report).not.toContain("@everyone");
  expect(report).toContain("objective");
  expect(report).toContain(c.context.headSha);
});

it("keeps proposal acceptance separate from the final verifier coverage goal", () => {
  const c = makeCandidate();
  c.context.task = "coverage-gap";
  const v = makeVerification(c),
    p = activePolicy();
  v.coverageComparison = compareCoverage(
    v.originalCoverage,
    v.candidateCoverage,
    true,
    "same runtime",
  );
  c.coverageRun = {
    initialCoverage: v.originalCoverage,
    rounds: [],
    stopReason: "target-reached",
  };
  const render = () =>
    renderReport({
      candidate: c,
      verification: v,
      review: null,
      decision: decide(c, v, null, p),
      policy: p,
      runUrl: "https://github.com/owner/repo/actions/runs/123",
    });
  expect(decide(c, v, null, p)).toBe("accepted");
  expect(render()).toContain("coverage run: partial");
  for (const app of ["backend", "frontend"] as const)
    for (const metric of [
      "lines",
      "branches",
      "statements",
      "functions",
    ] as const)
      v.candidateCoverage[app][metric] = { covered: 80, total: 100, pct: 80 };
  // A changed denominator cannot establish a comparable goal.
  expect(render()).toContain("coverage run: partial");
  for (const app of ["backend", "frontend"] as const)
    for (const metric of [
      "lines",
      "branches",
      "statements",
      "functions",
    ] as const)
      v.originalCoverage[app][metric] = { covered: 50, total: 100, pct: 50 };
  v.coverageComparison = compareCoverage(
    v.originalCoverage,
    v.candidateCoverage,
    true,
    "same runtime",
  );
  expect(render()).toContain("coverage run: reached");
  v.candidateCoverage.frontend.branches = { covered: 79, total: 100, pct: 79 };
  expect(render()).toContain("coverage run: partial");
  v.candidateCoverage.frontend.branches = { covered: 80, total: 100, pct: 80 };
  v.checks.pop();
  expect(render()).toContain("coverage run: partial");
});
it("refuses incomparable coverage-gap proposals and every metric regression", () => {
  const c = makeCandidate();
  c.context.task = "coverage-gap";
  const v = makeVerification(c),
    p = activePolicy();
  v.coverageComparison = compareCoverage(
    v.originalCoverage,
    v.candidateCoverage,
    false,
    "original evidence incomplete",
  );
  expect(decide(c, v, null, p)).toBe("inconclusive");
  v.coverageComparison = compareCoverage(
    v.originalCoverage,
    v.candidateCoverage,
    true,
    "same runtime",
  );
  v.candidateCoverage.backend.functions = { covered: 0, total: 2, pct: 0 };
  expect(decide(c, v, null, p)).toBe("failed");
});

it("requires independent review even when all candidate measurements meet the target", () => {
  const c = makeCandidate(),
    v = makeVerification(c),
    p = activePolicy(),
    r = makeReview(c);
  p.review = { enabled: true, gate: "required" };
  expect(decide(c, v, null, p)).toBe("inconclusive");
  expect(decide(c, v, r, p)).toBe("accepted");
  r.result.findings = [
    {
      id: "value",
      severity: "material",
      location: "http.test.ts:2",
      claim: "assertion misses the planned empty-body regression",
      evidence: "only non-null asserted",
      kind: "other",
      factId: null,
    },
  ];
  expect(decide(c, v, r, p)).toBe("inconclusive");
});

it("publishes bounded escaped value rationale without hiding the authoritative review decision", () => {
  const c = makeCandidate(),
    v = makeVerification(c),
    r = makeReview(c),
    p = activePolicy();
  const value = c.plan!.cases[0]!.value;
  value.regression = 'parse an empty body <img src="x"> @everyone';
  value.rationale = "HTTP correctness; adds no new setup";
  const report = renderReport({
    candidate: c,
    verification: v,
    review: r,
    decision: "accepted",
    policy: p,
    runUrl: "https://github.com/owner/repo/actions/runs/123",
  });
  expect(report).toContain("Planned test value");
  expect(report).toContain("parse an empty body &lt;img");
  expect(report).toContain("HTTP correctness; adds no new setup");
  expect(report).not.toContain("<img");
  expect(report).not.toContain("@everyone");
  expect(report).toContain("Review: passed");
});

it.each([
  { gate: "required", kind: "oracle-counterexample", expected: "inconclusive" },
  { gate: "advisory", kind: "oracle-counterexample", expected: "accepted" },
  { gate: "required", kind: "other", expected: "accepted" },
] as const)(
  "handles a passed review with a minor $kind finding under $gate review",
  ({ gate, kind, expected }) => {
    const c = makeCandidate(),
      v = makeVerification(c),
      r = makeReview(c),
      p = activePolicy();
    p.review = { enabled: true, gate };
    r.result.findings = [
      {
        id: "missed-regression",
        severity: "minor",
        location: "frontend/src/http.test.ts:12",
        claim:
          kind === "oracle-counterexample"
            ? "the approved wrong-header regression survives"
            : "optional unclaimed whitespace handling is uncovered",
        evidence: "the assertion checks body only",
        kind,
        factId: null,
      },
    ];
    expect(decide(c, v, r, p)).toBe(expected);
    const report = renderReport({
      candidate: c,
      verification: v,
      review: r,
      decision: decide(c, v, r, p),
      policy: p,
      runUrl: "https://github.com/owner/repo/actions/runs/123",
    });
    expect(report).toContain("unconfirmed");
    expect(report).not.toContain("host-confirmed");
    expect(v.facts).toEqual([]);
    if (gate === "required" && kind === "oracle-counterexample")
      expect(report).toContain(
        "Required review gate: oracle-counterexample findings block acceptance regardless of severity",
      );
    else expect(report).not.toContain("Required review gate:");
  },
);

it.each([
  { stopAtTarget: true, expectedPolicy: "stop at the coverage milestone" },
  {
    stopAtTarget: false,
    expectedPolicy: "bounded continuation after the coverage milestone",
  },
])(
  "reports stopAtTarget=$stopAtTarget separately from measured coverage attainment",
  ({ stopAtTarget, expectedPolicy }) => {
    const c = makeCandidate();
    c.context.task = "coverage-gap";
    const v = makeVerification(c),
      p = activePolicy();
    p.coverage = {
      target: { lines: 80, branches: 80 },
      maxRounds: 8,
      noProgressRounds: 3,
      stopAtTarget,
    };
    for (const app of ["backend", "frontend"] as const)
      for (const metric of [
        "lines",
        "branches",
        "statements",
        "functions",
      ] as const) {
        v.originalCoverage[app][metric] = { covered: 50, total: 100, pct: 50 };
        v.candidateCoverage[app][metric] = { covered: 80, total: 100, pct: 80 };
      }
    v.coverageComparison = compareCoverage(
      v.originalCoverage,
      v.candidateCoverage,
      true,
      "same runtime",
    );
    c.coverageRun = {
      initialCoverage: v.originalCoverage,
      rounds: [],
      stopReason: stopAtTarget ? "target-reached" : "round-limit",
    };
    const render = () =>
      renderReport({
        candidate: c,
        verification: v,
        review: null,
        decision: decide(c, v, null, p),
        policy: p,
        runUrl: "https://github.com/owner/repo/actions/runs/123",
      });
    const report = render();
    expect(report).toContain("Coverage milestone: reached");
    expect(report).toContain("lines >= 80% and branches >= 80%");
    expect(report).toContain("Coverage stopping policy: " + expectedPolicy);
    expect(report).toContain("100% objective met: false");
    expect(report).toContain("not proof of semantic completeness");
    if (!stopAtTarget)
      expect(report).toMatch(/round.*no-progress.*call.*budget.*deadline/);
    v.candidateCoverage.frontend.branches = {
      covered: 79,
      total: 100,
      pct: 79,
    };
    expect(render()).toContain("Coverage milestone: partial");
    v.candidateCoverage.frontend.branches = {
      covered: 80,
      total: 100,
      pct: 80,
    };
    v.checks.pop();
    expect(render()).toContain("Coverage milestone: partial");
  },
);

it("uses the compatible default stopping policy without claiming unverified coverage attainment", () => {
  const c = makeCandidate();
  c.context.task = "coverage-gap";
  const report = renderReport({
    candidate: c,
    verification: makeVerification(c),
    review: null,
    decision: "accepted",
    runUrl: "https://github.com/owner/repo/actions/runs/123",
  });
  expect(report).toContain("coverage run: partial");
  expect(report).toContain(
    "Coverage stopping policy: stop at the coverage milestone",
  );
});

it.each([false, true])(
  "reports verified coverage independently from an incomplete required review (manifest: %s)",
  (hasReview) => {
    const c = makeCandidate();
    c.context.task = "coverage-gap";
    const v = makeVerification(c),
      p = activePolicy(),
      r = hasReview ? makeReview(c) : null;
    p.review = { enabled: true, gate: "required" };
    if (r) r.result.status = "inconclusive";
    for (const app of ["backend", "frontend"] as const)
      for (const metric of [
        "lines",
        "branches",
        "statements",
        "functions",
      ] as const) {
        v.originalCoverage[app][metric] = { covered: 50, total: 100, pct: 50 };
        v.candidateCoverage[app][metric] = { covered: 85, total: 100, pct: 85 };
      }
    v.coverageComparison = compareCoverage(
      v.originalCoverage,
      v.candidateCoverage,
      true,
      "same runtime",
    );
    const decision = decide(c, v, r, p);
    expect(decision).toBe("inconclusive");
    const report = renderReport({
      candidate: c,
      verification: v,
      review: r,
      decision,
      policy: p,
      runUrl: "https://github.com/owner/repo/actions/runs/123",
    });
    expect(report).toContain("proposal: inconclusive");
    expect(report).toContain("Coverage milestone: reached");
    expect(report).toContain("coverage run: reached");
  },
);

it.each(
  (["backend", "frontend"] as const).flatMap((app) =>
    (["lines", "branches", "statements", "functions"] as const).map(
      (metric) => ({
        app,
        metric,
      }),
    ),
  ),
)(
  "rejects automatic pr-change $app/$metric coverage regression despite passed required review",
  ({ app, metric }) => {
    const c = makeCandidate();
    c.context.trigger = {
      kind: "workflow-run",
      workflowId: 1,
      runId: "456",
      attempt: 1,
    };
    const v = makeVerification(c),
      r = makeReview(c),
      p = activePolicy(),
      before = v.originalCoverage[app][metric];
    p.review = { enabled: true, gate: "required" };
    v.candidateCoverage[app][metric] = {
      covered: before.covered - 1,
      total: before.total,
      pct: (100 * (before.covered - 1)) / before.total,
    };
    v.coverageComparison = compareCoverage(
      v.originalCoverage,
      v.candidateCoverage,
      true,
      "same head/config/runtime",
    );
    expect(decide(c, v, r, p)).toBe("failed");
  },
);

it("keeps automatic pr-change proposals inconclusive with incomparable original evidence", () => {
  const c = makeCandidate();
  c.context.trigger = {
    kind: "workflow-run",
    workflowId: 1,
    runId: "456",
    attempt: 1,
  };
  const v = makeVerification(c),
    r = makeReview(c),
    p = activePolicy();
  p.review = { enabled: true, gate: "required" };
  v.coverageComparison = compareCoverage(
    v.originalCoverage,
    v.candidateCoverage,
    false,
    "original evidence incomplete",
  );
  expect(decide(c, v, r, p)).toBe("inconclusive");
});

it("accepts verified automatic pr-change proposals below the coverage target", () => {
  const c = makeCandidate();
  c.context.trigger = {
    kind: "workflow-run",
    workflowId: 1,
    runId: "456",
    attempt: 1,
  };
  const v = makeVerification(c),
    r = makeReview(c),
    p = activePolicy();
  p.review = { enabled: true, gate: "required" };
  // The fixture's unchanged 50% lines and 25% branches are below the 80% target.
  expect(decide(c, v, r, p)).toBe("accepted");
});
