import {
  callSchema,
  usageSchema,
  limits,
  type CallRecord,
  type NativeResult,
  type Role,
} from "./contracts.js";
import type { Policy } from "./config.js";
export class Budget {
  private readonly entries = new Map<string, CallRecord>();
  private readonly finalized = new Set<string>();
  constructor(
    private readonly policy: Policy,
    private readonly deadlineMs: number,
    prior: CallRecord[] = [],
  ) {
    for (const row of prior) {
      const record = callSchema.parse(row);
      if (this.entries.has(record.callId)) throw new Error("duplicate call");
      this.entries.set(record.callId, record);
      this.finalized.add(record.callId);
    }
  }
  reserve(callId: string, role: Role, now: number): CallRecord {
    if (now >= this.deadlineMs) throw new Error("run deadline exceeded");
    if (this.entries.has(callId) || this.entries.size >= limits.calls)
      throw new Error("call limit or duplicate");
    const selected = this.policy.roles[role];
    if (!selected) throw new Error("role not configured");
    const spent = [...this.entries.values()].reduce(
      (sum, r) => sum + (r.usage?.estimatedUsd ?? r.reservedEstimateUsd),
      0,
    );
    if (
      spent + selected.allocationUsd >
      this.policy.maxEstimatedUsd + Number.EPSILON
    )
      throw new Error("budget exhausted");
    const row: CallRecord = {
      callId,
      role,
      provider: selected.provider,
      model: selected.model,
      reservedEstimateUsd: selected.allocationUsd,
      usage: null,
      elapsedMs: 0,
      status: "unknown",
    };
    this.entries.set(callId, row);
    return structuredClone(row);
  }
  finish(callId: string, outcome: NativeResult, elapsedMs: number): void {
    const row = this.entries.get(callId);
    if (!row || this.finalized.has(callId))
      throw new Error("invalid or duplicate final");
    const updated = callSchema.parse({
      ...row,
      status: outcome.status,
      usage: outcome.usage === null ? null : usageSchema.parse(outcome.usage),
      elapsedMs,
    });
    this.entries.set(callId, updated);
    this.finalized.add(callId);
  }
  records(): CallRecord[] {
    return structuredClone([...this.entries.values()]);
  }
}
