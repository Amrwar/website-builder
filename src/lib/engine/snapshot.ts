import type { ScopeTierId } from "@/db/schema/enums";

/**
 * Reading a stored scope snapshot.
 *
 * `order_items.scope_snapshot` is a historical record: it holds whatever the
 * engine of the day produced, and the shape has already changed once -- Phase
 * 10 replaced the assessor's flat `guaranteedDays` with a `delivery` object.
 * An order placed before that change must still render.
 *
 * So snapshots are read through this one tolerant accessor rather than cast to
 * the current interface. A cast would compile and then quietly produce
 * `undefined` on older rows, which on a checkout page means a missing delivery
 * promise on a document somebody paid against.
 */

export interface SnapshotFacts {
  tier: ScopeTierId | null;
  buildType: string | null;
  /** Capability keys that were in scope. */
  capabilityKeys: readonly string[];
  guaranteedDays: number | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

export function readSnapshot(value: unknown): SnapshotFacts | null {
  const root = asRecord(value);
  if (!root) return null;

  const delivery = asRecord(root.delivery);
  const days = delivery ? delivery.guaranteedDays : root.guaranteedDays;

  const capabilities = Array.isArray(root.capabilities) ? root.capabilities : [];

  return {
    tier: typeof root.tier === "string" ? (root.tier as ScopeTierId) : null,
    buildType: typeof root.buildType === "string" ? root.buildType : null,
    capabilityKeys: capabilities
      .map((entry) => asRecord(entry)?.key)
      .filter((key): key is string => typeof key === "string"),
    guaranteedDays: typeof days === "number" ? days : null,
  };
}
