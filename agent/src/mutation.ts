import { readFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  runAppProcess,
  readExecutionReport,
  testImage,
  writeExecutionConfig,
} from "./execution.js";
import {
  limits,
  type CheckStatus,
  type Gate,
  type CheckResult,
} from "./contracts.js";
const statuses = [
  "Killed",
  "Survived",
  "NoCoverage",
  "Timeout",
  "CompileError",
  "RuntimeError",
  "RunError",
  "Ignored",
  "Pending",
] as const;
const reportSchema = z.object({
  files: z.record(
    z.string(),
    z.object({ mutants: z.array(z.object({ status: z.enum(statuses) })) }),
  ),
});
export function classifyMutation(input: {
  exitCode: number | null;
  report: unknown;
  setupError: boolean;
}): CheckStatus {
  if (input.setupError || input.report === null || input.exitCode !== 0)
    return "error";
  const parsed = reportSchema.safeParse(input.report);
  if (!parsed.success) return "error";
  const mutants = Object.values(parsed.data.files).flatMap((f) => f.mutants);
  if (
    !mutants.length ||
    mutants.some((m) =>
      ["RuntimeError", "RunError", "Pending"].includes(m.status),
    )
  )
    return "inconclusive";
  return "passed";
}
export async function runMutation(
  workspace: string,
  gate: Gate,
  signal: AbortSignal,
  paths: string[] = [
    "backend/src/features/todos/mappers.ts",
    "frontend/src/components/SuccessNotice.tsx",
  ],
  deadline = Date.now() + limits.roleMs,
  requireAttestation = true,
): Promise<CheckResult> {
  const logPath = ".agent-evidence/mutation.log",
    logs = join(workspace, ".agent-evidence");
  await mkdir(logs, { recursive: true });
  const check: CheckResult = {
    id: "mutation",
    gate,
    status: "inconclusive",
    reason: "not executed",
    command: "pinned Stryker 10.0.0 / Vitest 4.1.11; scoped TS/TSX",
    exitCode: null,
    logPath,
  };
  if (
    !paths.length ||
    paths.length > 2 ||
    paths.some(
      (p) =>
        !/^(backend|frontend)\/src\/[A-Za-z0-9_/-]+\.tsx?$/.test(p) ||
        /\.test\./.test(p),
    )
  )
    return { ...check, reason: "unsupported or excessive mutation scope" };
  const reasons: string[] = [];
  const expires = Math.min(deadline, Date.now() + limits.roleMs);
  try {
    if (requireAttestation) {
      const proof = JSON.parse(
        await readFile(
          join(process.cwd(), "mutation-conformance.json"),
          "utf8",
        ),
      );
      if (
        proof.node !== "24.13.1" ||
        proof.image !== testImage ||
        proof.stryker !== "10.0.0" ||
        proof.vitest !== "4.1.11" ||
        proof.backend !== true ||
        proof.frontendTsx !== true
      )
        throw new Error("mutation pilot not attested");
    }
    for (const path of paths) {
      const app = path.split("/")[0]!,
        root = join(workspace, app),
        relative = path.slice(app.length + 1),
        before = await readExecutionReport(root, relative, limits.payload);
      const digest = (b: string) =>
        createHash("sha256").update(b).digest("hex");
      const configName = ".cloudfide-stryker-" + randomUUID() + ".json";
      await writeExecutionConfig(
        root,
        configName,
        JSON.stringify({
          testRunner: "vitest",
          plugins: [
            "/runtime/node_modules/@stryker-mutator/vitest-runner/dist/src/index.js",
          ],
          mutate: [relative],
          vitest: {
            configFile:
              app === "frontend" ? "vite.config.ts" : "vitest.config.ts",
            related: true,
          },
          reporters: ["json"],
          jsonReporter: { fileName: "reports/mutation/mutation.json" },
          concurrency: 1,
          timeoutMS: 5000,
          thresholds: { high: 80, low: 60, break: null },
          inPlace: false,
          ignorePatterns: ["coverage", "reports", ".agent-evidence"],
        }),
      );
      let native;
      try {
        const remaining = expires - Date.now();
        if (remaining <= 0) throw new Error("mutation deadline");
        native = await runAppProcess(
          "node",
          [
            "/runtime/node_modules/@stryker-mutator/core/bin/stryker.js",
            "run",
            "/work/" + configName,
          ],
          {
            cwd: root,
            mutationRuntime: resolve("mutation-runtime"),
            maxBytes: limits.log,
            timeoutMs: Math.min(limits.roleMs, remaining),
          },
          signal,
        );
        await appendLog(
          join(workspace, logPath),
          path + "\n" + native.stdout + "\n" + native.stderr,
        );
      } finally {
        if (
          digest(before) !==
          digest(await readExecutionReport(root, relative, limits.payload))
        ) {
          throw new Error("mutation changed original source");
        }
      }
      if (native.exitCode !== 0)
        return {
          ...check,
          status: "error",
          exitCode: native.exitCode,
          reason: path + ": mutation command failed; see raw log",
        };
      const raw = JSON.parse(
          await readExecutionReport(
            root,
            "reports/mutation/mutation.json",
            limits.payload,
          ),
        ),
        status = classifyMutation({
          exitCode: native.exitCode,
          report: raw,
          setupError: false,
        });
      if (status !== "passed")
        return {
          ...check,
          status,
          exitCode: native.exitCode,
          reason: path + ": mutation did not complete",
        };
      const counts: Record<string, number> = {};
      for (const file of Object.values(reportSchema.parse(raw).files))
        for (const mutant of file.mutants)
          counts[mutant.status] = (counts[mutant.status] ?? 0) + 1;
      reasons.push(path + ": " + JSON.stringify(counts));
    }
    return {
      ...check,
      status: "passed",
      exitCode: 0,
      reason:
        reasons.join("; ") +
        "; survivors are evidence, not confirmed production defects",
    };
  } catch (error) {
    return {
      ...check,
      status: signal.aborted ? "cancelled" : "error",
      reason: error instanceof Error ? error.message : "mutation error",
    };
  }
}
async function appendLog(path: string, text: string) {
  await import("node:fs/promises").then((fs) =>
    fs.appendFile(path, text + "\n"),
  );
}
