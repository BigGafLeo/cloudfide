import { z } from "zod";
// Restrict metadata from the pinned binary's own bundled catalog. Never obtain
// instructions, endpoints or model defaults from repository input or a live catalog.
export const codexModelRestrictions = Object.freeze({
  tool_mode: "direct",
  shell_type: "disabled",
  apply_patch_tool_type: null,
  experimental_supported_tools: Object.freeze([] as string[]),
  supports_search_tool: false,
  node_repl_disabled: true,
});
const catalogSchema = z.object({
  models: z.array(z.looseObject({ slug: z.string() })),
});
export function restrictCodexCatalog(json: string, model: string): string {
  const catalog = catalogSchema.parse(JSON.parse(json));
  const selected = catalog.models.filter((entry) => entry.slug === model);
  if (selected.length !== 1)
    throw new Error(
      "Codex model must appear exactly once in the pinned bundled catalog",
    );
  return JSON.stringify({
    models: [{ ...selected[0], ...codexModelRestrictions }],
  });
}
