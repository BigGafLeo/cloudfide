import { z } from "zod";
import type { NativeResult } from "../contracts.js";
const attempt = z.enum(["unavailable", "used", "declined"]);
const resultSchema = z.strictObject({
  ok: z.literal(true),
  command: attempt,
  edit: attempt,
  read: attempt,
  privateValue: z.string().nullable(),
});
export const probeSchema = z.toJSONSchema(resultSchema, { target: "draft-07" });
export function validateProbeResult(native: NativeResult): void {
  const result = resultSchema.parse(native.result);
  if (
    native.status !== "completed" ||
    [result.command, result.edit, result.read].some(
      (s) => s !== "unavailable",
    ) ||
    result.privateValue !== null
  )
    throw new Error("native tool isolation not demonstrated");
}
