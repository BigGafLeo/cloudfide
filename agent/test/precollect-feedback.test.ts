import { beforeEach, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { collectEvidence } from "../src/precollect.js";
import { runAppProcess } from "../src/execution.js";
import { checkSchema } from "../src/contracts.js";
import { scratch, removeScratch } from "../src/workspace.js";
import { makeContext } from "./support.js";

vi.mock("../src/execution.js", async (original) => ({
  ...(await original<typeof import("../src/execution.js")>()),
  runAppProcess: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(runAppProcess).mockReset();
  vi.mocked(runAppProcess).mockResolvedValue({
    exitCode: 0,
    stdout: "",
    stderr: "",
  });
});

async function collectWithFailure(
  failedCommand: string,
  stdout: string,
  stderr: string,
) {
  const root = await scratch("typecheck-feedback");
  const calls: { app: string; args: string[]; network: boolean | undefined }[] =
    [];
  vi.mocked(runAppProcess).mockImplementation(
    async (_binary, args, options) => {
      const app = basename(options.cwd);
      calls.push({ app, args, network: options.network });
      return app === "frontend" && args[1] === failedCommand
        ? { exitCode: 2, stdout, stderr }
        : { exitCode: 0, stdout: "", stderr: "" };
    },
  );
  try {
    const evidence = await collectEvidence(
      root,
      makeContext(),
      new AbortController().signal,
    );
    const logId = failedCommand === "test" ? "unit" : failedCommand;
    const rawLog = await readFile(
      join(root, ".agent-evidence/frontend/" + logId + ".log"),
      "utf8",
    );
    return { evidence, rawLog, calls };
  } finally {
    await removeScratch(root);
  }
}

it("carries failed typecheck diagnostics from both streams without changing app command execution", async () => {
  const stdout =
    "src/api.test.ts(18,7): error TS2322: Type 'string' is not assignable to type 'number'.";
  const stderr =
    "src/utils.test.ts(9,3): error TS2554: Expected 2 arguments, but got 1.\nnpm run arbitrary-diagnostic-text";
  const { evidence, rawLog, calls } = await collectWithFailure(
    "typecheck",
    stdout,
    stderr,
  );
  const check = evidence.checks.find(
    (entry) => entry.id === "frontend:typecheck",
  )!;
  expect(check.status).toBe("failed");
  expect(check.exitCode).toBe(2);
  expect(check.reason).toContain(stdout);
  expect(check.reason).toContain(stderr);
  expect(check.reason).toMatch(/untrusted/i);
  expect(checkSchema.safeParse(check).success).toBe(true);
  expect(rawLog).toBe(stdout + "\n" + stderr);
  expect(calls).toEqual([
    {
      app: "backend",
      args: ["ci", "--ignore-scripts", "--no-audit", "--no-fund"],
      network: true,
    },
    { app: "backend", args: ["run", "db:generate"], network: true },
    { app: "backend", args: ["run", "typecheck"], network: false },
    {
      app: "backend",
      args: [
        "run",
        "test",
        "--",
        "--reporter=json",
        "--outputFile=.agent-tests.json",
      ],
      network: false,
    },
    {
      app: "backend",
      args: [
        "run",
        "test:coverage",
        "--",
        "--reporter=json",
        "--outputFile=.agent-coverage-tests.json",
        "--coverage.reporter=json",
        "--coverage.reporter=json-summary",
        "--coverage.reportOnFailure=true",
      ],
      network: false,
    },
    {
      app: "frontend",
      args: ["ci", "--ignore-scripts", "--no-audit", "--no-fund"],
      network: true,
    },
    { app: "frontend", args: ["run", "typecheck"], network: false },
    {
      app: "frontend",
      args: [
        "run",
        "test",
        "--",
        "--reporter=json",
        "--outputFile=.agent-tests.json",
      ],
      network: false,
    },
    {
      app: "frontend",
      args: [
        "run",
        "test:coverage",
        "--",
        "--reporter=json",
        "--outputFile=.agent-coverage-tests.json",
        "--coverage.reporter=json",
        "--coverage.reporter=json-summary",
        "--coverage.reportOnFailure=true",
      ],
      network: false,
    },
  ]);
  expect(
    evidence.checks
      .filter((entry) => entry.id.startsWith("frontend:"))
      .map((entry) => entry.status),
  ).toEqual(["passed", "failed", "passed", "passed"]);
});

it("bounds each diagnostic stream in the schema while retaining the full raw log", async () => {
  const stdout =
    "src/api.test.ts(18,7): error TS2322: incompatible value\n" +
    "a".repeat(6000);
  const stderr =
    "src/utils.test.ts(9,3): error TS2554: missing argument\n" +
    "b".repeat(6000);
  const { evidence, rawLog } = await collectWithFailure(
    "typecheck",
    stdout,
    stderr,
  );
  const check = evidence.checks.find(
    (entry) => entry.id === "frontend:typecheck",
  )!;
  expect(check.reason).toContain("error TS2322: incompatible value");
  expect(check.reason).toContain("error TS2554: missing argument");
  expect(check.reason.length).toBeLessThanOrEqual(4096);
  expect(checkSchema.safeParse(check).success).toBe(true);
  expect(rawLog).toBe(stdout + "\n" + stderr);
});

it("keeps the generic fallback when a failed typecheck has no diagnostics", async () => {
  const { evidence } = await collectWithFailure("typecheck", " \n", "");
  expect(
    evidence.checks.find((entry) => entry.id === "frontend:typecheck")?.reason,
  ).toBe("command failed");
});

it("keeps non-typecheck failure reasons and successful typecheck reasons unchanged", async () => {
  const { evidence } = await collectWithFailure(
    "test",
    "unit failure output",
    "unit stderr",
  );
  expect(
    evidence.checks.find((entry) => entry.id === "frontend:unit")?.reason,
  ).toBe("command failed");
  expect(
    evidence.checks.find((entry) => entry.id === "frontend:typecheck")?.reason,
  ).toBe("");
  expect(
    evidence.checks.find((entry) => entry.id === "frontend:coverage")?.status,
  ).toBe("passed");
});
