import { spawn } from "node:child_process";
const mode = process.argv[2];
if (mode === "secret") console.log(process.env.CODEX_API_KEY);
if (mode === "flood") {
  process.stdout.write("x".repeat(1000000));
  setInterval(() => {}, 1000);
}
if (mode === "hang") {
  spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
    stdio: "inherit",
  });
  setInterval(() => {}, 1000);
}
