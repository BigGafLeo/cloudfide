import type { EventEmitter } from "node:events";
export function terminationScope(
  host: Pick<EventEmitter, "on" | "off"> = process,
): { signal: AbortSignal; dispose(): void } {
  const controller = new AbortController();
  const interrupt = () => {
    if (host === process) process.exitCode = 130;
    controller.abort(new Error("SIGINT"));
  };
  const terminate = () => {
    if (host === process) process.exitCode = 143;
    controller.abort(new Error("SIGTERM"));
  };
  host.on("SIGINT", interrupt);
  host.on("SIGTERM", terminate);
  return {
    signal: controller.signal,
    dispose() {
      host.off("SIGINT", interrupt);
      host.off("SIGTERM", terminate);
    },
  };
}
