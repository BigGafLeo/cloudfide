import { dirname, join } from "node:path";
import { runProcess } from "../src/providers/process.js";
// Trusted tiny test fixtures only; production always uses the container executor.
export function runFixtureProcess(
  binary: string,
  args: string[],
  options: { cwd: string; timeoutMs: number; maxBytes: number },
  signal: AbortSignal,
) {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    CI: "true",
  };
  if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
  return runProcess(
    process.platform === "win32" ? process.execPath : binary,
    process.platform === "win32"
      ? [
          join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
          ...args,
        ]
      : args,
    { ...options, env, stdin: "" },
    signal,
  );
}
