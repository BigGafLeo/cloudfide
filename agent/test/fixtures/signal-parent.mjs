import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { terminationScope } from "../../src/termination.ts";
import { leaseCodexAuth } from "../../src/providers/auth.ts";
import { runProcess } from "../../src/providers/process.ts";
const root = process.argv[2],
  source = join(root, "auth"),
  home = join(root, "isolated");
await mkdir(source);
await mkdir(home);
await writeFile(
  join(source, "auth.json"),
  JSON.stringify({
    auth_mode: "chatgpt",
    tokens: { refresh_token: "fixture-original" },
  }),
);
const release = await leaseCodexAuth(source, home),
  scope = terminationScope();
await writeFile(
  join(home, "auth.json"),
  JSON.stringify({
    auth_mode: "chatgpt",
    tokens: { refresh_token: "fixture-refreshed" },
  }),
);
try {
  const running = runProcess(
    process.execPath,
    ["-e", "setInterval(()=>{},1000)"],
    {
      cwd: root,
      env: { PATH: process.env.PATH ?? "", HOME: root },
      stdin: "",
      maxBytes: 1000,
      timeoutMs: 10000,
    },
    scope.signal,
  );
  await writeFile(join(root, "ready"), "ready");
  try {
    await running;
  } catch (error) {
    if (!scope.signal.aborted) throw error;
  }
} finally {
  await release();
  scope.dispose();
  await writeFile(join(root, "cleanup"), "completed");
}
