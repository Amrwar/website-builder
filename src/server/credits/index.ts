import "server-only";

import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  creditAccounts,
  creditLedger,
  type CreditAccount,
  type CreditEntry,
} from "@/db/schema";
import type { CreditEntryKind } from "@/db/schema/enums";
import { ApiError } from "@/lib/api/response";
import { applyMovement, balanceFrom, type CreditRefusal } from "@/lib/credits";
import { logger } from "@/lib/logger";
import type { AuthContext } from "@/server/auth";

/**
 * Build credit, server side.
 *
 * Credit is a platform-level resource held by a **person**, not by a website.
 * Nothing in this module takes a project as a required argument; a project id
 * is at most a label on a ledger entry saying what the credit went towards.
 * That is what makes "can I use last month's credit on my new app?" a yes
 * rather than a migration.
 *
 * Every movement is one transaction that writes the ledger entry and updates
 * the cached balance together, and the whole thing is guarded by a conditional
 * UPDATE: a spend only succeeds if the balance it was computed against is
 * still the balance. Two simultaneous spends cannot both pass.
 */

export type CreditResult<T> =
  { ok: true; value: T } | { ok: false; reason: CreditRefusal | "race" };

/** Finds or creates somebody's account. */
export async function accountFor(ownerId: string): Promise<CreditAccount> {
  const [row] = await db
    .insert(creditAccounts)
    .values({ ownerId, balanceMinutes: 0 })
    .onConflictDoUpdate({
      target: creditAccounts.ownerId,
      // A no-op update, so the insert always returns the row whether it
      // created one or found one. `onConflictDoNothing` returns nothing.
      set: { updatedAt: new Date() },
    })
    .returning();

  if (!row) throw new ApiError("internal_error", "That credit account was not found.");
  return row;
}

export interface MovementInput {
  ownerId: string;
  kind: CreditEntryKind;
  /** Always positive. Direction comes from the kind. */
  minutes: number;
  description?: string | null;
  reason?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  expiresAt?: Date | null;
  /** Stops a retried grant counting twice. */
  idempotencyKey?: string | null;
  /** Only read for an adjustment, which is the one kind that can go either way. */
  adjustmentSign?: 1 | -1;
  actorUserId?: string | null;
}

/**
 * Records a movement.
 *
 * The balance is recomputed and written in the same transaction as the ledger
 * entry, and the UPDATE is conditional on the balance that was read. A
 * concurrent movement therefore loses the race and is refused, rather than
 * both of them writing a balance derived from a figure that is no longer true.
 */
export async function recordMovement(
  input: MovementInput,
): Promise<CreditResult<CreditEntry>> {
  const account = await accountFor(input.ownerId);

  const outcome = applyMovement(
    account.balanceMinutes,
    { kind: input.kind, minutes: input.minutes, reason: input.reason },
    input.adjustmentSign ?? 1,
  );

  if (!outcome.ok) return { ok: false, reason: outcome.reason };

  try {
    const entry = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(creditAccounts)
        .set({ balanceMinutes: outcome.balanceAfter, updatedAt: new Date() })
        .where(
          sql`${creditAccounts.id} = ${account.id} and ${creditAccounts.balanceMinutes} = ${account.balanceMinutes}`,
        )
        .returning();

      if (!updated) return null;

      const [row] = await tx
        .insert(creditLedger)
        .values({
          accountId: account.id,
          kind: input.kind,
          minutes: outcome.signedMinutes,
          balanceAfterMinutes: outcome.balanceAfter,
          subjectType: input.subjectType ?? null,
          subjectId: input.subjectId ?? null,
          description: input.description ?? null,
          reason: input.reason ?? null,
          actorUserId: input.actorUserId ?? null,
          expiresAt: input.expiresAt ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
        })
        .returning();

      return row ?? null;
    });

    if (!entry) return { ok: false, reason: "race" };
    return { ok: true, value: entry };
  } catch (error) {
    // The unique index on idempotency_key is the real guard against a retried
    // grant landing twice; a loser here already has its entry recorded.
    if (input.idempotencyKey && String(error).includes("credit_ledger_idempotency")) {
      logger.info("credit grant already recorded", { key: input.idempotencyKey });
      const existing = await db.query.creditLedger.findFirst({
        where: eq(creditLedger.idempotencyKey, input.idempotencyKey),
      });
      if (existing) return { ok: true, value: existing };
    }
    throw error;
  }
}

/**
 * Spends credit against a piece of work.
 *
 * `subjectType` and `subjectId` are an untyped pair on purpose: credit is
 * spent on whatever kind of work exists, and a column per kind would mean a
 * migration for every new product type -- exactly the coupling this resource
 * is designed to avoid.
 */
export async function spendCredit(
  input: {
    ownerId: string;
    minutes: number;
    subjectType: string;
    subjectId: string;
    description?: string;
  },
  context: AuthContext,
): Promise<CreditResult<CreditEntry>> {
  // Scoped to the session's own id unless staff are acting. A server action is
  // a public endpoint, and the owner must never come from the payload.
  if (input.ownerId !== context.user.id && !context.can("billing:manage")) {
    throw new ApiError("not_found", "Not found.");
  }

  return recordMovement({
    ownerId: input.ownerId,
    kind: "spent",
    minutes: input.minutes,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    description: input.description ?? null,
    actorUserId: context.user.id,
  });
}

/** The statement a customer reads. */
export async function statementFor(
  ownerId: string,
  context: AuthContext,
  limit = 50,
): Promise<{ balanceMinutes: number; entries: CreditEntry[] }> {
  if (ownerId !== context.user.id && !context.can("customer:read")) {
    throw new ApiError("not_found", "Not found.");
  }

  const account = await accountFor(ownerId);

  const entries = await db
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.accountId, account.id))
    .orderBy(desc(creditLedger.occurredAt))
    .limit(limit);

  return { balanceMinutes: account.balanceMinutes, entries };
}

/**
 * Rebuilds a cached balance from the ledger.
 *
 * The ledger is the truth; the account column is a cache kept because the
 * balance is read on nearly every screen. This is what proves the cache, and a
 * disagreement is a bug in us rather than a reason to doubt the ledger.
 */
export async function recomputeBalance(
  ownerId: string,
  context: AuthContext,
): Promise<{ cached: number; actual: number; corrected: boolean }> {
  if (!context.can("billing:manage")) {
    throw new ApiError("not_found", "Not found.");
  }

  const account = await accountFor(ownerId);
  const entries = await db
    .select({ minutes: creditLedger.minutes })
    .from(creditLedger)
    .where(eq(creditLedger.accountId, account.id));

  const actual = balanceFrom(entries);

  if (actual === account.balanceMinutes) {
    return { cached: account.balanceMinutes, actual, corrected: false };
  }

  logger.error("credit balance disagreed with its ledger", {
    ownerId,
    cached: account.balanceMinutes,
    actual,
  });

  await db
    .update(creditAccounts)
    .set({ balanceMinutes: actual, updatedAt: new Date() })
    .where(eq(creditAccounts.id, account.id));

  return { cached: account.balanceMinutes, actual, corrected: true };
}
