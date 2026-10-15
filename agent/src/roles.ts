import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Role } from "./contracts.js";
export const roleMetadata = {
  analyst: {
    skill: "analyze-unit-gaps",
    purpose: "Find missing unit behavior",
  },
  writer: { skill: "write-unit-tests", purpose: "Write planned unit tests" },
  reviewer: {
    skill: "review-unit-tests",
    purpose: "Review generated and relevant existing unit tests",
  },
} as const;
export async function loadRole(
  role: Role,
  apps: ("frontend" | "backend")[],
  mutation: boolean,
  root = process.cwd(),
): Promise<{ text: string; skillsUsed: string[] }> {
  const skill = roleMetadata[role].skill,
    skillsUsed: string[] = [skill],
    chunks = [await readFile(join(root, "skills", skill, "SKILL.md"), "utf8")];
  for (const app of [...new Set(apps)]) {
    const relative = skill + "/references/" + app + ".md";
    chunks.push(await readFile(join(root, "skills", relative), "utf8"));
    skillsUsed.push(relative);
  }
  if (mutation) {
    chunks.push(
      await readFile(
        join(root, "skills", "_shared", "mutation-facts.md"),
        "utf8",
      ),
    );
    skillsUsed.push("_shared/mutation-facts.md");
  }
  return { text: chunks.join("\n\n"), skillsUsed };
}
