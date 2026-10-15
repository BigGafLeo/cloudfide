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
