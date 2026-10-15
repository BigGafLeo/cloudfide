import { usageSchema, type FinalUsage } from "../contracts.js";
export interface Rates {
  input: number;
  cached: number;
  output: number;
}
export interface NormalizedNative {
  result: unknown;
  usage: FinalUsage | null;
}
function dollars(
  input: number,
  cached: number,
  output: number,
  rates?: Rates,
): number | null {
  return rates
    ? Number(
        (
          ((input - cached) * rates.input +
            cached * rates.cached +
            output * rates.output) /
          1000000
        ).toFixed(12),
      )
    : null;
}
function obj(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid native object");
  return value as Record<string, unknown>;
}
function num(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("invalid native usage");
  return value;
}
export function normalizeCodex(
  jsonl: string,
  rates?: Rates,
  finalText?: string,
): NormalizedNative {
  const events = jsonl
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((s) => obj(JSON.parse(s)));
  const finals = events.filter((e) => e.type === "turn.completed");
  const messages: Record<string, unknown>[] = [];
  for (const e of events) {
    if (
      ![
        "thread.started",
        "turn.started",
        "item.started",
        "item.updated",
        "item.completed",
        "turn.completed",
        "error",
        "turn.failed",
      ].includes(String(e.type))
    )
      throw new Error("unsupported native event");
    if (e.type === "error" || e.type === "turn.failed")
      throw new Error("native failed");
    if (e.item) {
      const item = obj(e.item);
      if (!["agent_message", "reasoning"].includes(String(item.type)))
        throw new Error("unexpected native tool");
      if (e.type === "item.completed" && item.type === "agent_message")
        messages.push(item);
    }
  }
  if (
    finals.length !== 1 ||
    messages.length === 0 ||
    (finalText === undefined && messages.length !== 1) ||
    events.at(-1)?.type !== "turn.completed"
  )
    throw new Error("missing/duplicate native final");
  const last = messages.at(-1)!.text;
  if (
    typeof last !== "string" ||
    (finalText !== undefined && last.trim() !== finalText.trim())
  )
    throw new Error("native final artifact mismatch");
  const result = JSON.parse(finalText ?? last);
  const raw = finals[0]!.usage;
  if (raw === undefined) return { result, usage: null };
  const u = obj(raw);
  const input = num(u.input_tokens),
    cached = num(u.cached_input_tokens ?? 0),
    output = num(u.output_tokens);
  return {
    result,
    usage: usageSchema.parse({
      inputTokens: input,
      cachedInputTokens: cached,
      outputTokens: output,
      estimatedUsd: dollars(input, cached, output, rates),
      raw,
    }),
  };
}
export function normalizeClaude(json: string): NormalizedNative {
  const e = obj(JSON.parse(json));
  if (
    e.type !== "result" ||
    e.is_error !== false ||
    e.structured_output === undefined
  )
    throw new Error("native failed or missing structured output");
  if (!e.usage) return { result: e.structured_output, usage: null };
  const u = obj(e.usage);
  const cached = num(u.cache_read_input_tokens ?? 0),
    input =
      num(u.input_tokens) + cached + num(u.cache_creation_input_tokens ?? 0),
    output = num(u.output_tokens);
  return {
    result: e.structured_output,
    usage: usageSchema.parse({
      inputTokens: input,
      cachedInputTokens: cached,
      outputTokens: output,
      estimatedUsd:
        typeof e.total_cost_usd === "number" ? e.total_cost_usd : null,
      raw: {
        usage: e.usage,
        totalCostUsd: e.total_cost_usd,
        modelUsage: e.modelUsage,
      },
    }),
  };
}
