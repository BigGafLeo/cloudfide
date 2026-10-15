import { join } from "node:path";
import type { ProviderAdapter } from "../contracts.js";
import type { Policy } from "../config.js";
import { CliAdapter } from "./cli.js";
export function createAdapters(
  policy: Policy,
  root = process.cwd(),
): Map<string, ProviderAdapter> {
  return new Map([
    [
      "codex",
      new CliAdapter(
        "codex",
        policy,
        root,
        join(root, "native/node_modules/.bin/codex"),
      ),
    ],
    [
      "claude",
      new CliAdapter(
        "claude",
        policy,
        root,
        join(root, "native/node_modules/.bin/claude"),
      ),
    ],
  ]);
}
