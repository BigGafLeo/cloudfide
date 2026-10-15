import { expect, it } from "vitest";
import { runProcess } from "../src/providers/process.js";
it("preserves a multibyte model file split across stdout chunks", async () => {
  const code =
    "const b=Buffer.from('żółw');process.stdout.write(b.subarray(0,1));setTimeout(()=>process.stdout.write(b.subarray(1)),30)";
  const result = await runProcess(
    process.execPath,
    ["-e", code],
    {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH! },
      stdin: "",
      maxBytes: 100,
      timeoutMs: 2000,
    },
    new AbortController().signal,
  );
  expect(result.stdout).toBe("żółw");
});
