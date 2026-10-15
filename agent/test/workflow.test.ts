import { limits } from "../src/contracts.js";
import { expect, it } from "vitest";
import { parse } from "yaml";
import { readFile } from "node:fs/promises";
const directory = new URL("../../.github/workflows/", import.meta.url);
it("keeps PR execution, provider secrets and publication in separate trusted jobs", async () => {
  const w = parse(
    await readFile(new URL("unit-test-agent.yml", directory), "utf8"),
  );
  expect(w.on.workflow_run.workflows).toEqual(["CI"]);
  expect(w.on.pull_request_target).toBeUndefined();
  expect(w.permissions).toEqual({});
  const j = w.jobs;
  expect(j.precollect.needs).toEqual(["resolve"]);
  expect(j.agent.needs).toEqual(["resolve", "precollect"]);
  expect(j.verifier.permissions).toEqual({
    contents: "read",
    actions: "read",
    "pull-requests": "read",
  });
  expect(j.publisher.permissions["pull-requests"]).toBe("write");
  expect(j.publisher.permissions.contents).toBe("read");
  expect(j.publisher.if).toContain("always()");
  expect(j.publisher.needs).toContain("verifier");
  expect(j.agent.concurrency.group).toContain("needs.resolve.outputs.pr");
  for (const [id, job] of Object.entries(j) as [string, any][]) {
    for (const step of job.steps) {
      if (step.uses) expect(step.uses).toMatch(/@[a-f0-9]{40}$/);
      if (step.uses?.startsWith("actions/checkout@")) {
        expect(step.with.ref).toBe("${{ github.sha }}");
        expect(step.with["persist-credentials"]).toBe(false);
      }
      if (
        JSON.stringify(step.env ?? {}).includes(
          "secrets.CLAUDE_CODE_OAUTH_TOKEN",
        )
      )
        expect(["agent", "reviewer"]).toContain(id);
      if (["precollect", "verifier", "publisher", "resolve"].includes(id))
        expect(JSON.stringify(step)).not.toMatch(
          /secrets\.(OPENAI|CODEX|ANTHROPIC|CLAUDE)/,
        );
    }
  }
  expect(
    j.verifier.steps.find((s: any) => s.run === "npm start -- verify").env
      .ARTIFACT_AGENT,
  ).toBe("${{ needs.agent.outputs.artifact-id }}");
  expect(
    j.publisher.steps.find((s: any) => s.run === "npm start -- publish").env
      .ARTIFACT_VERIFIER,
  ).toBe("${{ needs.verifier.outputs.artifact-id }}");
});

it("publishes raw evidence separately from the strict one-entry transfers", async () => {
  const w = parse(
    await readFile(new URL("unit-test-agent.yml", directory), "utf8"),
  );
  for (const id of ["precollect", "verifier"]) {
    const upload = w.jobs[id].steps.find((s: any) =>
      s.with?.name?.endsWith("-" + id + "-logs"),
    );
    expect(upload?.with["include-hidden-files"]).toBe(true);
    expect(upload?.with.path).toContain("evidence");
  }
  const publish = w.jobs.publisher.steps.find(
    (s: any) => s.run === "npm start -- publish",
  );
  expect(publish.env.ARTIFACT_VERIFIER_LOGS).toBe(
    "${{ needs.verifier.outputs.logs-artifact-id }}",
  );
});

it("leaves Actions time for role execution plus setup and evidence publication", async () => {
  const w = parse(
    await readFile(new URL("unit-test-agent.yml", directory), "utf8"),
  );
  const roleMinutes = limits.roleMs / 60_000;
  expect(w.jobs.agent["timeout-minutes"]).toBeGreaterThanOrEqual(
    2 * roleMinutes + 15,
  );
  expect(w.jobs.reviewer["timeout-minutes"]).toBeGreaterThanOrEqual(
    roleMinutes + 15,
  );
  for (const id of ["precollect", "verifier"])
    expect(w.jobs[id]["timeout-minutes"]).toBeGreaterThanOrEqual(
      roleMinutes + 30,
    );
  const ci = parse(await readFile(new URL("ci.yml", directory), "utf8"));
  expect(ci.jobs.unit["timeout-minutes"]).toBeGreaterThanOrEqual(
    roleMinutes + 30,
  );
});
