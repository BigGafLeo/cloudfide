import { constants } from "node:fs";
import { lstat, open, realpath, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { runProcess, type ProcessOutput } from "./providers/process.js";
export const testImage =
  "node:24.13.1@sha256:00e9195ebd49985a6da8921f419978d85dfe354589755192dc090425ce4da2f7";

// Only the disposable app directory is writable inside the private container.
// The controller, its credentials, output, Docker socket and host PID namespace
// are never mounted. The same boundary applies to the optional mutation runner.
export async function runAppProcess(
  binary: "npm" | "node",
  args: string[],
  options: {
    cwd: string;
    timeoutMs: number;
    maxBytes: number;
    network?: boolean;
    mutationRuntime?: string;
  },
  signal: AbortSignal,
): Promise<ProcessOutput> {
  if (!["backend", "frontend"].includes(basename(options.cwd)))
    throw new Error("application mount path");
  const app = await realpath(options.cwd);
  if (app !== resolve(options.cwd) || app.includes(","))
    throw new Error("application mount link/path");
  const uid = process.getuid?.() ?? 1000,
    gid = process.getgid?.() ?? 1000;
  if (uid === 0)
    throw new Error("test controller must run as an unprivileged user");
  const name = "cloudfide-check-" + randomUUID();
  const env: Record<string, string> = { PATH: process.env.PATH ?? "" };
  if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
  const docker = (
    dockerArgs: string[],
    inputSignal: AbortSignal,
    timeoutMs = 30000,
    maxBytes = 65536,
  ) =>
    runProcess(
      "docker",
      dockerArgs,
      { cwd: options.cwd, env, stdin: "", timeoutMs, maxBytes },
      inputSignal,
    );
  const createArgs = [
    "create",
    "--pull=never",
    "--name",
    name,
    "--user",
    uid + ":" + gid,
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--read-only",
    "--pids-limit=256",
    "--memory=2g",
    "--cpus=2",
    "--network=" + (options.network ? "bridge" : "none"),
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,size=512m",
    "--workdir",
    "/work",
    "--env",
    "HOME=/tmp",
    "--env",
    "CI=true",
    "--env",
    "NODE_ENV=test",
    "--mount",
    "type=bind,source=" + app + ",target=/work",
  ];
  if (options.mutationRuntime) {
    const runtime = await realpath(options.mutationRuntime);
    if (runtime !== resolve(options.mutationRuntime) || runtime.includes(","))
      throw new Error("mutation runtime mount link/path");
    createArgs.push(
      "--mount",
      "type=bind,source=" + runtime + ",target=/runtime,readonly",
    );
  }
  createArgs.push("--entrypoint", binary, testImage, ...args);
  const expires = Date.now() + options.timeoutMs;
  let created = false;
  try {
    const creation = await docker(createArgs, signal);
    if (creation.exitCode !== 0)
      throw new Error("isolated check container unavailable");
    created = true;
    const remaining = expires - Date.now();
    if (remaining <= 0) throw new Error("timeout");
    return await docker(
      ["start", "--attach", name],
      signal,
      remaining,
      options.maxBytes,
    );
  } finally {
    const cleanup = await docker(
      ["rm", "--force", name],
      new AbortController().signal,
    );
    if (created && cleanup.exitCode !== 0)
      throw new Error("isolated check container cleanup failed");
  }
}

// Reports are untrusted container output. Never follow their links into host data.
export async function readExecutionReport(
  root: string,
  relative: string,
  maxBytes: number,
): Promise<string> {
  if (
    !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(relative) ||
    relative.split("/").some((p) => p === ".." || p === ".")
  )
    throw new Error("execution report path");
  const actualRoot = await realpath(root);
  if (actualRoot !== resolve(root)) throw new Error("execution root link");
  let path = root;
  const parts = relative.split("/");
  for (const [index, part] of parts.entries()) {
    path = join(path, part);
    const stat = await lstat(path);
    if (
      stat.isSymbolicLink() ||
      (index < parts.length - 1 && !stat.isDirectory()) ||
      (index === parts.length - 1 && (!stat.isFile() || stat.nlink !== 1))
    )
      throw new Error("execution report link/type");
    if (index === parts.length - 1 && stat.size > maxBytes)
      throw new Error("execution report bounds");
  }
  const file = await open(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > maxBytes)
      throw new Error("execution report bounds/type");
    const bytes = Buffer.alloc(maxBytes + 1);
    const read = await file.read(bytes, 0, bytes.length, 0);
    if (read.bytesRead > maxBytes) throw new Error("execution report bounds");
    return bytes.subarray(0, read.bytesRead).toString("utf8");
  } finally {
    await file.close();
  }
}

export async function writeExecutionConfig(
  root: string,
  name: string,
  content: string,
): Promise<void> {
  if (!/^\.cloudfide-stryker-[a-f0-9-]{36}\.json$/.test(name))
    throw new Error("execution config path");
  if ((await realpath(root)) !== resolve(root))
    throw new Error("execution root link");
  // O_CREAT|O_EXCL rejects every existing entry, including links. Never overwrite
  // a path created by earlier application execution.
  await writeFile(join(root, name), content, { flag: "wx", mode: 0o644 });
}
