import { expect, it } from "vitest";
import { mkdir, writeFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import {
  readExecutionReport,
  runAppProcess,
  writeExecutionConfig,
} from "../src/execution.js";
import { scratch, removeScratch } from "../src/workspace.js";
it("accepts a bounded regular report and rejects links or excessive bytes", async () => {
  const root = await scratch("execution-report");
  try {
    await mkdir(join(root, "coverage"));
    await writeFile(join(root, "coverage/report.json"), '{"ok":true}');
    expect(await readExecutionReport(root, "coverage/report.json", 20)).toBe(
      '{"ok":true}',
    );
    await expect(
      readExecutionReport(root, "coverage/report.json", 2),
    ).rejects.toThrow(/bounds/);
    if (process.platform !== "win32") {
      await symlink(
        join(root, "coverage/report.json"),
        join(root, "linked.json"),
      );
      await expect(
        readExecutionReport(root, "linked.json", 20),
      ).rejects.toThrow(/link/);
    }
    await expect(
      readExecutionReport(root, "../outside.json", 20),
    ).rejects.toThrow(/path/);
  } finally {
    await removeScratch(root);
  }
});

it.runIf(process.env.RUN_DOCKER_CHECKS === "1")(
  "runs app code in a private unprivileged container with no controller environment",
  async () => {
    const root = await scratch("docker-boundary"),
      app = join(root, "backend");
    try {
      await mkdir(app);
      await writeFile(join(app, "input.json"), '{"fixture":true}');
      const result = await runAppProcess(
        "node",
        [
          "-e",
          "const fs=require('fs');console.log(JSON.stringify({version:process.version,uid:process.getuid(),pid:process.pid,fixture:fs.existsSync('/work/input.json'),controller:fs.existsSync('/controller'),docker:fs.existsSync('/var/run/docker.sock'),github:!!process.env.GITHUB_TOKEN}));",
        ],
        { cwd: app, timeoutMs: 15000, maxBytes: 4096 },
        new AbortController().signal,
      );
      expect(result.exitCode).toBe(0);
      const facts = JSON.parse(result.stdout);
      expect(facts).toMatchObject({
        version: "v24.13.1",
        pid: 1,
        fixture: true,
        controller: false,
        docker: false,
        github: false,
      });
      expect(facts.uid).toBeGreaterThan(0);
      const failed = await runAppProcess(
        "node",
        ["-e", "process.exit(7)"],
        { cwd: app, timeoutMs: 15000, maxBytes: 4096 },
        new AbortController().signal,
      );
      expect(failed.exitCode).toBe(7);
      await expect(
        runAppProcess(
          "node",
          ["-e", "setInterval(()=>{},1000)"],
          { cwd: app, timeoutMs: 1500, maxBytes: 4096 },
          new AbortController().signal,
        ),
      ).rejects.toThrow(/timeout/);
    } finally {
      await removeScratch(root);
    }
  },
  45000,
);

it("creates a fresh execution config without replacing an existing path", async () => {
  const root = await scratch("exclusive-config"),
    app = join(root, "backend");
  try {
    await mkdir(app);
    const name = ".cloudfide-stryker-11111111-1111-1111-1111-111111111111.json";
    await writeExecutionConfig(app, name, '{"original":true}');
    await expect(
      writeExecutionConfig(app, name, '{"replacement":true}'),
    ).rejects.toThrow();
    expect(await readExecutionReport(app, name, 100)).toBe('{"original":true}');
  } finally {
    await removeScratch(root);
  }
});
