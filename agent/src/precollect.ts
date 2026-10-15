import { mkdir, writeFile, unlink, cp } from "node:fs/promises";
import { join } from "node:path";
import { runAppProcess, readExecutionReport } from "./execution.js";
import { normalizeCoverage, emptyCoverage } from "./coverage.js";
import {
  limits,
  type RunContext,
  type CheckResult,
  type CoverageReport,
} from "./contracts.js";
export interface CollectedEvidence {
  context: RunContext;
  checks: CheckResult[];
  coverage: CoverageReport;
  complete: boolean;
  comparisonReason: string;
  tests?: Partial<
    Record<
      "frontend" | "backend",
      { total: number; failed: number; failures: string[] }
    >
  >;
}
export async function collectEvidence(
  workspace: string,
  context: RunContext,
  signal: AbortSignal,
): Promise<CollectedEvidence> {
  const checks: CheckResult[] = [],
    summary: Record<string, unknown> = {},
    detail: Record<string, unknown> = {};
  let complete = true;
  const tests: NonNullable<CollectedEvidence["tests"]> = {};
  for (const app of ["backend", "frontend"] as const) {
    const root = join(workspace, app),
      logs = join(workspace, ".agent-evidence", app);
    await mkdir(logs, { recursive: true });
    for (const path of [
      ".agent-tests.json",
      ".agent-coverage-tests.json",
      "coverage/coverage-summary.json",
      "coverage/coverage-final.json",
    ])
      await unlink(join(root, path)).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    const commands: { id: string; args: string[] }[] = [
      {
        id: "install",
        args: ["ci", "--ignore-scripts", "--no-audit", "--no-fund"],
      },
    ];
    if (app === "backend")
      commands.push({ id: "generate", args: ["run", "db:generate"] });
    commands.push(
      { id: "typecheck", args: ["run", "typecheck"] },
      {
        id: "unit",
        args: [
          "run",
          "test",
          "--",
          "--reporter=json",
          "--outputFile=.agent-tests.json",
        ],
      },
      {
        id: "coverage",
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
      },
    );
    let setup = true;
    for (const command of commands) {
      const id = app + ":" + command.id,
        logPath = ".agent-evidence/" + app + "/" + command.id + ".log";
      if (!setup) {
        checks.push({
          id,
          gate: "required",
          status: "error",
          reason: "setup failed",
          command: "npm " + command.args.join(" "),
          exitCode: null,
          logPath,
        });
        continue;
      }
      try {
        const remaining = Date.parse(context.deadline) - Date.now();
        if (remaining <= 0) throw new Error("run deadline");
        const out = await runAppProcess(
          "npm",
          command.args,
          {
            cwd: root,
            network: command.id === "install" || command.id === "generate",
            maxBytes: limits.log,
            timeoutMs: Math.min(limits.roleMs, remaining),
          },
          signal,
        );
        await writeFile(
          join(workspace, logPath),
          out.stdout + "\n" + out.stderr,
        );
        checks.push({
          id,
          gate: "required",
          status: out.exitCode === 0 ? "passed" : "failed",
          reason: out.exitCode === 0 ? "" : "command failed",
          command: "npm " + command.args.join(" "),
          exitCode: out.exitCode,
          logPath,
        });
        if (
          (command.id === "install" || command.id === "generate") &&
          out.exitCode !== 0
        )
          setup = false;
      } catch (error) {
        checks.push({
          id,
          gate: "required",
          status: "error",
          reason: error instanceof Error ? error.message : "execution error",
          command: "npm " + command.args.join(" "),
          exitCode: null,
          logPath,
        });
        setup = false;
        complete = false;
      }
    }
    try {
      const report = JSON.parse(
        await readExecutionReport(root, ".agent-tests.json", limits.payload),
      ) as Record<string, unknown>;
      if (
        typeof report.numTotalTests !== "number" ||
        !Number.isSafeInteger(report.numTotalTests) ||
        report.numTotalTests < 1 ||
        typeof report.numFailedTests !== "number" ||
        !Number.isSafeInteger(report.numFailedTests) ||
        report.numFailedTests < 0 ||
        report.numFailedTests > report.numTotalTests
      )
        throw new Error("invalid Vitest JSON");
      tests[app] = {
        total: report.numTotalTests,
        failed: report.numFailedTests,
        failures: failedAssertions(report),
      };
      summary[app] = JSON.parse(
        await readExecutionReport(
          root,
          "coverage/coverage-summary.json",
          limits.payload,
        ),
      );
      detail[app] = JSON.parse(
        await readExecutionReport(
          root,
          "coverage/coverage-final.json",
          limits.payload,
        ),
      );
    } catch {
      complete = false;
    }
  }
  let coverage = emptyCoverage();
  try {
    coverage = normalizeCoverage(summary, detail);
  } catch {
    complete = false;
  }
  return {
    context,
    checks,
    coverage,
    complete,
    tests,
    comparisonReason: complete
      ? "same head/config/runtime"
      : "missing mechanical evidence",
  };
}

function failedAssertions(report: Record<string, unknown>): string[] {
  const failures: string[] = [];
  if (Array.isArray(report.testResults))
    for (const file of report.testResults) {
      if (file && Array.isArray(file.assertionResults))
        for (const test of file.assertionResults) {
          if (test?.status === "failed" && Array.isArray(test.failureMessages))
            failures.push(
              (
                String(test.fullName ?? "") +
                ": " +
                test.failureMessages.map(String).join("; ")
              ).slice(0, 4096),
            );
        }
    }
  return failures.slice(0, 10);
}

export async function collectPrecollection(
  baseRoot: string,
  headRoot: string,
  context: RunContext,
  outputRoot: string,
  signal: AbortSignal,
): Promise<{ base: CollectedEvidence; head: CollectedEvidence }> {
  const base = await collectEvidence(baseRoot, context, signal);
  const head = await collectEvidence(headRoot, context, signal);
  await mkdir(outputRoot, { recursive: true });
  await cp(
    join(baseRoot, ".agent-evidence"),
    join(outputRoot, "base-evidence"),
    { recursive: true },
  );
  await cp(
    join(headRoot, ".agent-evidence"),
    join(outputRoot, "head-evidence"),
    { recursive: true },
  );
  return { base, head };
}
