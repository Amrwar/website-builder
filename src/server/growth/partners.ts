import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import {
  affiliates,
  commissions,
  partners,
  payouts,
  referralCodes,
  referrals,
  type Affiliate,
  type Commission,
  type Partner,
} from "@/db/schema";
import { COMMISSION_BASIS_POINTS, COMMISSION_HOLD_DAYS } from "@/config/growth";
import { PARTNER_KINDS } from "@/db/schema/enums";
import { ApiError } from "@/lib/api/response";
import { commissionFor, isReleasable } from "@/lib/growth/fraud";
import { logger } from "@/lib/logger";
import type { AuthContext } from "@/server/auth";
import { recordAudit } from "@/server/admin/audit";
import { createOwnedCode } from "./referrals";

/**
 * Partners, affiliates and what they earn.
 *
 * Both are external accounts that send business here, and both earn a
 * commission rather than build credit. They are separate tables because they
 * are separate relationships -- an agency briefs the work and stands behind
 * it; an affiliate sends traffic -- and collapsing them would mean one
 * commission rate for two commercial arrangements.
 *
 * What they share is the attribution path: an approved account gets a referral
 * code from the same table a customer's comes from, so there is one answer to
 * "where did this customer come from" regardless of who sent them.
 *
 * **No amount is ever accepted from a caller.** A commission is computed from
 * the order's own frozen total and the rate stored on the account, both read
 * server-side. There is no input through which a different figure could be
 * proposed, which is what makes commission manipulation structural rather than
 * merely validated against.
 */

/* -------------------------------------------------------------------------
 * Applications
 * ---------------------------------------------------------------------- */

const partnerApplication = z.object({
  kind: z.enum(PARTNER_KINDS),
  companyName: z.string().trim().min(2).max(120),
  contactName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  website: z.string().trim().url().max(300).nullable(),
  country: z.string().trim().max(80).nullable(),
  pitch: z.string().trim().min(20).max(2000),
});

export type PartnerApplication = z.infer<typeof partnerApplication>;

export type ApplyRefusal = "invalid" | "already_applied";

export type ApplyResult<T> =
  { ok: true; value: T } | { ok: false; reason: ApplyRefusal; message?: string };

/**
 * Records a partner application.
 *
 * Open to anybody, signed in or not: an agency's principal may never configure
 * a build themselves, and requiring an account before they can apply would
 * turn the first step into two.
 *
 * Applications start at `applied` with a zero rate and no code. Nothing is
 * attributable and nothing is earnable until a person approves it.
 */
export async function applyAsPartner(
  input: unknown,
  context?: AuthContext,
): Promise<ApplyResult<Partner>> {
  const parsed = partnerApplication.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid",
      message: parsed.error.issues[0]?.message,
    };
  }

  try {
    const [created] = await db
      .insert(partners)
      .values({
        ...parsed.data,
        status: "applied",
        commissionBasisPoints: 0,
        userId: context?.user.id ?? null,
      })
      .returning();

    if (!created) throw new ApiError("internal_error", "Not saved.");

    logger.info("partner applied", { partnerId: created.id, kind: created.kind });
    return { ok: true, value: created };
  } catch (error) {
    if (String(error).includes("partners_email_key")) {
      return { ok: false, reason: "already_applied" };
    }
    throw error;
  }
}

const affiliateApplication = partnerApplication
  .omit({ kind: true, companyName: true, contactName: true, country: true })
  .extend({ name: z.string().trim().min(2).max(120) });

export async function applyAsAffiliate(
  input: unknown,
  context?: AuthContext,
): Promise<ApplyResult<Affiliate>> {
  const parsed = affiliateApplication.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid",
      message: parsed.error.issues[0]?.message,
    };
  }

  try {
    const [created] = await db
      .insert(affiliates)
      .values({
        name: parsed.data.name,
        email: parsed.data.email,
        website: parsed.data.website,
        status: "applied",
        commissionBasisPoints: 0,
        userId: context?.user.id ?? null,
      })
      .returning();

    if (!created) throw new ApiError("internal_error", "Not saved.");
    return { ok: true, value: created };
  } catch (error) {
    if (String(error).includes("affiliates_email_key")) {
      return { ok: false, reason: "already_applied" };
    }
    throw error;
  }
}

/* -------------------------------------------------------------------------
 * Approval
 * ---------------------------------------------------------------------- */

function requireManage(context: AuthContext): void {
  // Approving a partner sets a commission rate, which is a commercial
  // commitment. `billing:manage` is the permission that already governs money.
  if (!context.can("billing:manage")) {
    throw new ApiError("not_found", "Not found.");
  }
}

export type DecisionRefusal = "not_found" | "already_decided" | "reason_required";

/**
 * Approves a partner and issues their code.
 *
 * The rate is clamped to something sane here rather than trusted: a caller
 * fat-fingering 150% would otherwise commit the business to paying more than
 * the sale was worth, and the database CHECK would only catch it later, at the
 * first commission.
 */
export async function approvePartner(
  partnerId: string,
  commissionBasisPoints: number | undefined,
  context: AuthContext,
): Promise<
  { ok: true; partner: Partner; code: string } | { ok: false; reason: DecisionRefusal }
> {
  requireManage(context);

  const existing = await db.query.partners.findFirst({
    where: eq(partners.id, partnerId),
  });
  if (!existing) return { ok: false, reason: "not_found" };
  if (existing.status === "approved") return { ok: false, reason: "already_decided" };

  const rate = clampRate(commissionBasisPoints ?? COMMISSION_BASIS_POINTS.partner);
  const now = new Date();

  const [approved] = await db
    .update(partners)
    .set({
      status: "approved",
      commissionBasisPoints: rate,
      approvedAt: now,
      approvedByUserId: context.user.id,
      statusNote: null,
      updatedAt: now,
    })
    .where(and(eq(partners.id, partnerId), eq(partners.status, existing.status)))
    .returning();

  if (!approved) return { ok: false, reason: "already_decided" };

  const existingCode = await db.query.referralCodes.findFirst({
    where: eq(referralCodes.ownerPartnerId, partnerId),
  });
  const code =
    existingCode ?? (await createOwnedCode({ kind: "partner", id: partnerId }));

  await recordAudit({
    category: "configuration",
    action: "partner.approved",
    actor: context,
    subjectType: "partner",
    subjectId: partnerId,
    subjectLabel: approved.companyName,
    before: {
      status: existing.status,
      commissionBasisPoints: existing.commissionBasisPoints,
    },
    after: { status: "approved", commissionBasisPoints: rate, code: code.code },
  });

  return { ok: true, partner: approved, code: code.code };
}

export async function approveAffiliate(
  affiliateId: string,
  commissionBasisPoints: number | undefined,
  context: AuthContext,
): Promise<
  | { ok: true; affiliate: Affiliate; code: string }
  | { ok: false; reason: DecisionRefusal }
> {
  requireManage(context);

  const existing = await db.query.affiliates.findFirst({
    where: eq(affiliates.id, affiliateId),
  });
  if (!existing) return { ok: false, reason: "not_found" };
  if (existing.status === "approved") return { ok: false, reason: "already_decided" };

  const rate = clampRate(commissionBasisPoints ?? COMMISSION_BASIS_POINTS.affiliate);
  const now = new Date();

  const [approved] = await db
    .update(affiliates)
    .set({
      status: "approved",
      commissionBasisPoints: rate,
      approvedAt: now,
      approvedByUserId: context.user.id,
      statusNote: null,
      updatedAt: now,
    })
    .where(and(eq(affiliates.id, affiliateId), eq(affiliates.status, existing.status)))
    .returning();

  if (!approved) return { ok: false, reason: "already_decided" };

  const existingCode = await db.query.referralCodes.findFirst({
    where: eq(referralCodes.ownerAffiliateId, affiliateId),
  });
  const code =
    existingCode ?? (await createOwnedCode({ kind: "affiliate", id: affiliateId }));

  await recordAudit({
    category: "configuration",
    action: "affiliate.approved",
    actor: context,
    subjectType: "affiliate",
    subjectId: affiliateId,
    subjectLabel: approved.name,
    before: { status: existing.status },
    after: { status: "approved", commissionBasisPoints: rate, code: code.code },
  });

  return { ok: true, affiliate: approved, code: code.code };
}

/**
 * Rejects or suspends an account.
 *
 * A note is required. Telling somebody their partnership has been suspended
 * without saying why is not a decision, it is a disappearance -- and the audit
 * entry would be unreadable six months later.
 */
export async function setPartnerStatus(
  input: {
    kind: "partner" | "affiliate";
    id: string;
    status: "suspended" | "rejected" | "approved";
    note: string;
  },
  context: AuthContext,
): Promise<{ ok: boolean; reason?: DecisionRefusal }> {
  requireManage(context);

  const note = input.note.trim();
  if (!note) return { ok: false, reason: "reason_required" };

  const now = new Date();

  if (input.kind === "partner") {
    const [row] = await db
      .update(partners)
      .set({ status: input.status, statusNote: note, updatedAt: now })
      .where(eq(partners.id, input.id))
      .returning();
    if (!row) return { ok: false, reason: "not_found" };

    await deactivateCodes({ ownerPartnerId: input.id }, input.status !== "approved");
    await recordAudit({
      category: "configuration",
      action: `partner.${input.status}`,
      actor: context,
      subjectType: "partner",
      subjectId: input.id,
      subjectLabel: row.companyName,
      after: { status: input.status },
      reason: note,
    });
    return { ok: true };
  }

  const [row] = await db
    .update(affiliates)
    .set({ status: input.status, statusNote: note, updatedAt: now })
    .where(eq(affiliates.id, input.id))
    .returning();
  if (!row) return { ok: false, reason: "not_found" };

  await deactivateCodes({ ownerAffiliateId: input.id }, input.status !== "approved");
  await recordAudit({
    category: "configuration",
    action: `affiliate.${input.status}`,
    actor: context,
    subjectType: "affiliate",
    subjectId: input.id,
    subjectLabel: row.name,
    after: { status: input.status },
    reason: note,
  });
  return { ok: true };
}

/**
 * Switches an account's codes off with it.
 *
 * A suspended partner whose link keeps attributing is a partner who keeps
 * earning while suspended.
 */
async function deactivateCodes(
  owner: { ownerPartnerId?: string; ownerAffiliateId?: string },
  deactivate: boolean,
): Promise<void> {
  const where = owner.ownerPartnerId
    ? eq(referralCodes.ownerPartnerId, owner.ownerPartnerId)
    : eq(referralCodes.ownerAffiliateId, owner.ownerAffiliateId!);

  await db
    .update(referralCodes)
    .set({ isActive: !deactivate, updatedAt: new Date() })
    .where(where);
}

function clampRate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(10_000, Math.round(value)));
}

/* -------------------------------------------------------------------------
 * Commissions
 * ---------------------------------------------------------------------- */

/**
 * Raises the commission a conversion earned.
 *
 * Called from the same conversion path as the customer reward, and does
 * nothing for customer-owned codes. The amount is computed here from the
 * order's frozen total and the rate on the account; both the gross and the
 * rate are copied onto the row so a later rate change cannot rewrite what was
 * already earned.
 *
 * Unique on the referral, so a retried conversion raises one commission.
 */
export async function raiseCommission(input: {
  referralId: string;
  orderId: string;
  grossMinorUnits: number;
  currency: Commission["currency"];
}): Promise<Commission | null> {
  const referral = await db.query.referrals.findFirst({
    where: eq(referrals.id, input.referralId),
  });
  if (!referral) return null;

  const code = await db.query.referralCodes.findFirst({
    where: eq(referralCodes.id, referral.codeId),
  });
  if (!code || code.ownerKind === "customer") return null;

  const account =
    code.ownerKind === "partner" && code.ownerPartnerId
      ? await db.query.partners.findFirst({ where: eq(partners.id, code.ownerPartnerId) })
      : code.ownerAffiliateId
        ? await db.query.affiliates.findFirst({
            where: eq(affiliates.id, code.ownerAffiliateId),
          })
        : null;

  if (!account || account.status !== "approved") return null;

  const rate = account.commissionBasisPoints;
  const amount = commissionFor(input.grossMinorUnits, rate);
  if (amount <= 0) return null;

  try {
    const [created] = await db
      .insert(commissions)
      .values({
        referralId: referral.id,
        affiliateId: code.ownerKind === "affiliate" ? code.ownerAffiliateId : null,
        partnerId: code.ownerKind === "partner" ? code.ownerPartnerId : null,
        orderId: input.orderId,
        grossMinorUnits: input.grossMinorUnits,
        rateBasisPoints: rate,
        amountMinorUnits: amount,
        currency: input.currency,
        state: "pending",
      })
      .returning();

    return created ?? null;
  } catch (error) {
    // The unique index is the real guard against paying twice for one
    // conversion; losing the race means the commission already exists.
    if (String(error).includes("commissions_referral_key")) {
      logger.info("commission already raised", { referralId: referral.id });
      return null;
    }
    throw error;
  }
}

/**
 * Approves a pending commission for payment.
 *
 * Refuses inside the hold period. A commission approved the day a build starts
 * can be paid before the customer could possibly have asked for their money
 * back, which is how a refunded order ends up having paid a commission nobody
 * can recover.
 */
export async function approveCommission(
  commissionId: string,
  context: AuthContext,
  now: Date = new Date(),
): Promise<{ ok: boolean; reason?: "not_found" | "on_hold" | "wrong_state" }> {
  requireManage(context);

  const commission = await db.query.commissions.findFirst({
    where: eq(commissions.id, commissionId),
  });
  if (!commission) return { ok: false, reason: "not_found" };
  if (commission.state !== "pending") return { ok: false, reason: "wrong_state" };

  const referral = await db.query.referrals.findFirst({
    where: eq(referrals.id, commission.referralId),
  });
  const convertedAt = referral?.convertedAt ?? commission.createdAt;

  if (!isReleasable(convertedAt, now, COMMISSION_HOLD_DAYS)) {
    return { ok: false, reason: "on_hold" };
  }

  // A commission on a referral that was later blocked is not payable, whatever
  // state the commission itself is in.
  if (
    referral &&
    (referral.fraudState === "blocked" || referral.rewardState === "clawed_back")
  ) {
    return { ok: false, reason: "wrong_state" };
  }

  await db
    .update(commissions)
    .set({
      state: "approved",
      approvedAt: now,
      approvedByUserId: context.user.id,
      updatedAt: now,
    })
    .where(and(eq(commissions.id, commissionId), eq(commissions.state, "pending")));

  await recordAudit({
    category: "finance",
    action: "commission.approved",
    actor: context,
    subjectType: "commission",
    subjectId: commissionId,
    after: {
      amountMinorUnits: commission.amountMinorUnits,
      currency: commission.currency,
    },
  });

  return { ok: true };
}

/** Reverses a commission, with the reason the database requires. */
export async function reverseCommission(
  commissionId: string,
  reason: string,
  context: AuthContext,
): Promise<{ ok: boolean; reason?: "not_found" | "reason_required" | "already_paid" }> {
  requireManage(context);

  const note = reason.trim();
  if (!note) return { ok: false, reason: "reason_required" };

  const commission = await db.query.commissions.findFirst({
    where: eq(commissions.id, commissionId),
  });
  if (!commission) return { ok: false, reason: "not_found" };
  // Money that has left the building is recovered by arrangement, not by an
  // UPDATE. Marking it reversed here would misstate the ledger.
  if (commission.state === "paid") return { ok: false, reason: "already_paid" };

  await db
    .update(commissions)
    .set({
      state: "reversed",
      reversedAt: new Date(),
      reversalReason: note,
      updatedAt: new Date(),
    })
    .where(eq(commissions.id, commissionId));

  await recordAudit({
    category: "finance",
    action: "commission.reversed",
    actor: context,
    subjectType: "commission",
    subjectId: commissionId,
    before: { state: commission.state },
    after: { state: "reversed" },
    reason: note,
  });

  return { ok: true };
}

/* -------------------------------------------------------------------------
 * Reading
 * ---------------------------------------------------------------------- */

export async function listPartners(context: AuthContext): Promise<Partner[]> {
  if (!context.can("analytics:read")) throw new ApiError("not_found", "Not found.");
  return db.select().from(partners).orderBy(desc(partners.createdAt));
}

export async function listAffiliates(context: AuthContext): Promise<Affiliate[]> {
  if (!context.can("analytics:read")) throw new ApiError("not_found", "Not found.");
  return db.select().from(affiliates).orderBy(desc(affiliates.createdAt));
}

export async function listCommissions(context: AuthContext): Promise<Commission[]> {
  if (!context.can("finance:read")) throw new ApiError("not_found", "Not found.");
  return db.select().from(commissions).orderBy(desc(commissions.createdAt)).limit(200);
}

export async function listPayouts(context: AuthContext) {
  if (!context.can("finance:read")) throw new ApiError("not_found", "Not found.");
  return db
    .select()
    .from(payouts)
    .orderBy(asc(payouts.status), desc(payouts.requestedAt));
}
