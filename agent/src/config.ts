import { z } from "zod";
import { limits, type Role } from "./contracts.js";
const roleConfig = z.strictObject({
  provider: z.string().min(1),
  auth: z.enum(["subscription", "api"]).optional(),
  model: z.string().min(1),
  allocationUsd: z.number().finite().positive(),
  pricingSource: z.string().min(1),
  pricingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rates: z
    .strictObject({
      input: z.number().finite().nonnegative(),
      cached: z.number().finite().nonnegative(),
      output: z.number().finite().nonnegative(),
    })
    .optional(),
});
const check = z
  .strictObject({
    enabled: z.boolean(),
    gate: z.enum(["required", "advisory"]),
  })
  .refine((c) => c.enabled || c.gate === "advisory", "disabled required check");
const policySchema = z.strictObject({
  trustedAuthors: z.array(z.string().min(1)).max(100),
  roles: z.strictObject({
    analyst: roleConfig.optional(),
    writer: roleConfig.optional(),
    reviewer: roleConfig.optional(),
  }),
  maxEstimatedUsd: z.number().finite().nonnegative(),
  review: check.default({ enabled: false, gate: "advisory" }),
  mutation: check.default({ enabled: false, gate: "advisory" }),
});
export type Policy = z.infer<typeof policySchema>;
export function parsePolicy(
  input: unknown,
  providerIds: readonly string[],
): Policy {
  const policy = policySchema.parse(input);
  for (const role of ["analyst", "writer", "reviewer"] as Role[]) {
    const selected = policy.roles[role];
    if (selected && !providerIds.includes(selected.provider))
      throw new Error("Unknown provider: " + selected.provider);
  }
  if (policy.review.enabled && !policy.roles.reviewer)
    throw new Error("Reviewer configuration required");
  if (Boolean(policy.roles.analyst) !== Boolean(policy.roles.writer))
    throw new Error("Analyst and writer must be configured together");
  if (
    Object.values(policy.roles).some(
      (r) => r.allocationUsd > policy.maxEstimatedUsd,
    )
  )
    throw new Error("Allocation exceeds budget");
  return policy;
}
export { limits };
