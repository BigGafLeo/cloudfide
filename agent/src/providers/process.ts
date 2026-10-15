import { spawn, execFile } from "node:child_process";
export interface ProcessOptions {
  cwd: string;
  env: Record<string, string>;
  stdin: string;
  maxBytes: number;
  timeoutMs: number;
}
export interface ProcessOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}
export function runProcess(
  binary: string,
  args: string[],
  options: ProcessOptions,
  signal: AbortSignal,
): Promise<ProcessOutput> {
  if (signal.aborted) return Promise.reject(new Error("cancelled"));
  const secrets = Object.entries(options.env)
    .filter(
      ([key, value]) => /KEY|TOKEN|PASSWORD/.test(key) && value.length > 0,
    )
    .map(([, value]) => value);
  const redact = (text: string) =>
    secrets.reduce((s, key) => s.split(key).join("[REDACTED]"), text);
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [],
      stderr: Buffer[] = [];
    let bytes = 0,
      failure: string | null = null,
      settled = false;
    let force: ReturnType<typeof setTimeout> | undefined;
    const stop = (reason: string) => {
      if (failure) return;
      failure = reason;
      if (child.pid) {
        if (process.platform === "win32")
          execFile(
            "taskkill.exe",
            ["/PID", String(child.pid), "/T", "/F"],
            { windowsHide: true },
            () => {
              child.kill();
            },
          );
        else {
          try {
            process.kill(-child.pid, "SIGTERM");
          } catch {}
          force = setTimeout(() => {
            try {
              process.kill(-child.pid!, "SIGKILL");
            } catch {}
          }, 1000);
        }
      }
    };
    const collect = (chunk: Buffer, destination: "out" | "err") => {
      bytes += chunk.length;
      if (bytes > options.maxBytes) {
        stop("output limit exceeded");
        return;
      }
      if (destination === "out") stdout.push(chunk);
      else stderr.push(chunk);
    };
    child.stdout.on("data", (b: Buffer) => collect(b, "out"));
    child.stderr.on("data", (b: Buffer) => collect(b, "err"));
    child.stdin.on("error", () => {});
    child.stdin.end(options.stdin);
    const abort = () => stop("cancelled");
    signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => stop("timeout"), options.timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      if (force) clearTimeout(force);
      signal.removeEventListener("abort", abort);
      if (child.pid && process.platform !== "win32") {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {}
      }
    };
    child.on("error", () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("process launch failed"));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (failure) reject(new Error(failure));
      else
        resolve({
          stdout: redact(Buffer.concat(stdout).toString("utf8")),
          stderr: redact(Buffer.concat(stderr).toString("utf8")),
          exitCode: code,
        });
    });
  });
}
