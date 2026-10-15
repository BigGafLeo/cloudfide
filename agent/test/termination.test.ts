import { expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { terminationScope } from "../src/termination.js";
it("aborts on termination without exiting before async native cleanup", async () => {
  const host = new EventEmitter(),
    order: string[] = [];
  const scope = terminationScope(host);
  const nativeCleanup = new Promise<void>((resolve) =>
    scope.signal.addEventListener(
      "abort",
      () =>
        setTimeout(() => {
          order.push("cleanup");
          resolve();
        }, 10),
      { once: true },
    ),
  );
  host.emit("SIGTERM");
  expect(scope.signal.aborted).toBe(true);
  expect(order).toEqual([]);
  await nativeCleanup;
  expect(order).toEqual(["cleanup"]);
  scope.dispose();
  expect(host.listenerCount("SIGTERM")).toBe(0);
});

import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { scratch, removeScratch } from "../src/workspace.js";
it.skipIf(process.platform !== "linux")(
  "SIGTERM stops the native child and completes credential refresh/unlock before exit",
  async () => {
    const root = await scratch("test-signal"),
      fixture = fileURLToPath(
        new URL("./fixtures/signal-parent.mjs", import.meta.url),
      );
    const parent = spawn(process.execPath, [fixture, root], {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
      env: { PATH: process.env.PATH ?? "", HOME: root },
    });
    let errors = "";
    parent.stderr.on("data", (b) => (errors += String(b)));
    const closed = new Promise<number | null>((resolve) =>
      parent.once("close", resolve),
    );
    try {
      const deadline = Date.now() + 5000;
      while (
        !(await access(join(root, "ready")).then(
          () => true,
          () => false,
        ))
      ) {
        if (Date.now() > deadline)
          throw new Error("fixture startup: " + errors);
        await new Promise((r) => setTimeout(r, 10));
      }
      parent.kill("SIGTERM");
      expect(await closed).toBe(143);
      expect(await readFile(join(root, "cleanup"), "utf8")).toBe("completed");
      expect(
        JSON.parse(await readFile(join(root, "auth/auth.json"), "utf8")).tokens
          .refresh_token,
      ).toBe("fixture-refreshed");
      expect(
        await access(join(root, "auth/.cloudfide-auth.lock")).then(
          () => true,
          () => false,
        ),
      ).toBe(false);
    } finally {
      if (parent.exitCode === null) {
        parent.kill("SIGKILL");
        await closed;
      }
      await removeScratch(root);
    }
  },
  15000,
);
