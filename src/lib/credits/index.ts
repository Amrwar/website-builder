import type { CreditEntryKind } from "@/db/schema/enums";

/**
 * Build credit.
 *
 * Credit is **minutes of build time held by a person**, not money held against
 * a website. Two decisions follow from that sentence and both are deliberate:
 *
 * 1. **Denominated in time.** Credit bought at one price and spent a year
 *    later must buy the same amount of work. A balance in currency would
 *    quietly devalue every time the price list moved, which is a worse deal
 *    than the customer agreed to.
 *
 * 2. **Held by a person.** It can be spent on a change to any project they
 *    own, on an automation, on something that does not exist yet. Attaching it
 *    to a website would make "can I use last month's credit on my new app?" a
 *    schema migration.
 *
 * This module is the arithmetic, and it is pure. The ledger it describes is
 * append-only in the database as well as in the application, so a correction
 * is another entry and a balance's history cannot be rewritten.
 */

/** The direction each kind of entry must move the balance. */
export const CREDIT_DIRECTION: Record<CreditEntryKind, "add" | "remove" | "either"> = {
  purchased: "add",
  granted: "add",
  awarded: "add",
  refunded: "add",
  spent: "remove",
  expired: "remove",
  // A correction can go either way; it is the only kind that can, and it is
  // the only kind that requires a stated reason.
  adjusted: "either",
};

export interface CreditMovement {
  kind: CreditEntryKind;
  /** Always positive. The direction comes from the kind. */
  minutes: number;
  reason?: string | null;
}

export type CreditRefusal =
  "not_positive" | "wrong_direction" | "insufficient_balance" | "reason_required";

export type CreditOutcome =
  | { ok: true; signedMinutes: number; balanceAfter: number }
  | { ok: false; reason: CreditRefusal };

/**
 * Applies a movement to a balance.
 *
 * Refuses rather than clamping. A spend of ninety minutes against a balance of
 * sixty is not a spend of sixty -- it is a request the customer needs to know
 * was not carried out, because the other thirty minutes of work will not
 * happen.
 */
export function applyMovement(
  balanceMinutes: number,
  movement: CreditMovement,
  /** Signed, for an adjustment, where the caller decides the direction. */
  adjustmentSign: 1 | -1 = 1,
): CreditOutcome {
  if (!Number.isInteger(movement.minutes) || movement.minutes <= 0) {
    return { ok: false, reason: "not_positive" };
  }

  const direction = CREDIT_DIRECTION[movement.kind];

  if (direction === "either" && !movement.reason?.trim()) {
    return { ok: false, reason: "reason_required" };
  }

  const sign = direction === "add" ? 1 : direction === "remove" ? -1 : adjustmentSign;

  const signedMinutes = movement.minutes * sign;
  const balanceAfter = balanceMinutes + signedMinutes;

  // Credit is prepaid. A negative balance is an invoice nobody agreed to.
  if (balanceAfter < 0) {
    return { ok: false, reason: "insufficient_balance" };
  }

  return { ok: true, signedMinutes, balanceAfter };
}

/**
 * Rebuilds a balance from the ledger.
 *
 * The account row caches the balance because it is read on nearly every
 * screen, and summing an append-only ledger each time is a scan that only
 * grows. This is the function that proves the cache: a disagreement is a bug
 * in us, never a reason to doubt the ledger.
 */
export function balanceFrom(entries: readonly { minutes: number }[]): number {
  return entries.reduce((carry, entry) => carry + entry.minutes, 0);
}

/** Entries that have passed their expiry and have not yet been written off. */
export function expiredEntries<T extends { minutes: number; expiresAt: Date | null }>(
  entries: readonly T[],
  now: Date,
): T[] {
  return entries.filter(
    (entry) => entry.minutes > 0 && entry.expiresAt !== null && entry.expiresAt <= now,
  );
}

/** Rendering: 90 minutes reads better as "1h 30m" than as "90". */
export function formatMinutes(minutes: number): { hours: number; minutes: number } {
  const whole = Math.max(0, Math.trunc(minutes));
  return { hours: Math.floor(whole / 60), minutes: whole % 60 };
}
