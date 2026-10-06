import "server-only";

import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  affiliates,
  orders,
  partners,
  projects,
  referralCodes,
  referrals,
  users,
  type Referral,
  type ReferralCode,
} from "@/db/schema";
import { ATTRIBUTION_WINDOW_DAYS, REFERRAL_REWARD_MINUTES } from "@/config/growth";
import { REFERRAL } from "@/config/referral";
import { serverEnv } from "@/config/env";
import { ApiError } from "@/lib/api/response";
import {
  emailFingerprint,
  generateCode,
  ipFingerprint,
  normaliseCode,
} from "@/lib/growth/codes";
import { assessReferral, isPayable, type FraudRule } from "@/lib/growth/fraud";
import { logger } from "@/lib/logger";
import type { AuthContext } from "@/server/auth";
import { recordMovement } from "@/server/credits";
import { recordAudit } from "@/server/admin/audit";

/**
 * Referrals.
 *
 * One attribution path for every kind of referrer. A code is resolved, a
 * referral row is created at signup, and the reward is paid at conversion --
 * which is **build start**, not signup and not payment.
 *
 * Build start is the strictest honest trigger and it is the one already
 * promised publicly: the money is in, the customer has committed their assets,
 * and staff have begun. An order that is refunded before then never pays
 * anybody, which removes the obvious attack of placing an order, claiming a
 * reward and cancelling.
 *
 * Rewards go through the existing credit ledger rather than a parallel
 * balance. Credit is already a platform-level resource held by a person, which
 * is exactly what a referral reward is.
 */

/* -------------------------------------------------------------------------
 * Fingerprinting
 * ---------------------------------------------------------------------- */

let warnedAboutSecret = false;

/**
 * The salt for identity fingerprints, or null when none is configured.
 *
 * Returning null rather than falling back to a constant is the point: two of
 * the nine anti-abuse rules stop firing and the log says so, which is honest.
 * Hashing with a known constant would look like protection while providing
 * none.
 */
function fingerprintSecret(): string | null {
  const secret = serverEnv().GROWTH_FINGERPRINT_SECRET ?? null;

  if (!secret && !warnedAboutSecret) {
    warnedAboutSecret = true;
    logger.warn(
      "GROWTH_FINGERPRINT_SECRET is not set; duplicate-account and " +
        "shared-network referral checks are disabled",
    );
  }

  return secret;
}

/* -------------------------------------------------------------------------
 * Codes
 * ---------------------------------------------------------------------- */

/**
 * Returns the caller's own code, creating one on first use.
 *
 * Scoped to the session's id, never to a payload: a server action is a public
 * endpoint, and "whose code is this" is not a question a caller may answer.
 */
export async function myReferralCode(context: AuthContext): Promise<ReferralCode> {
  const existing = await db.query.referralCodes.findFirst({
    where: and(
      eq(referralCodes.ownerUserId, context.user.id),
      eq(referralCodes.ownerKind, "customer"),
    ),
  });
  if (existing) return existing;

  // Retried rather than assumed unique: the code space is large, but a
  // collision that surfaced as a 500 on somebody's dashboard would be a bad
  // way to learn the odds are not zero.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const [created] = await db
        .insert(referralCodes)
        .values({
          code: generateCode(),
          ownerKind: "customer",
          ownerUserId: context.user.id,
        })
        .returning();
      if (created) return created;
    } catch (error) {
      if (!String(error).includes("referral_codes_code_key")) throw error;
    }
  }

  throw new ApiError("internal_error", "A referral code could not be created.");
}

/** Creates a code for an approved partner or affiliate. */
export async function createOwnedCode(owner: {
  kind: "partner" | "affiliate";
  id: string;
}): Promise<ReferralCode> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const [created] = await db
        .insert(referralCodes)
        .values({
          code: generateCode(),
          ownerKind: owner.kind,
          ...(owner.kind === "partner"
            ? { ownerPartnerId: owner.id }
            : { ownerAffiliateId: owner.id }),
        })
        .returning();
      if (created) return created;
    } catch (error) {
      if (!String(error).includes("referral_codes_code_key")) throw error;
    }
  }

  throw new ApiError("internal_error", "A referral code could not be created.");
}

/**
 * Resolves a code from a URL or a form.
 *
 * Returns only what attribution needs. Deliberately never returns the owner's
 * identity to a caller: a visitor holding somebody's code should not be able
 * to turn it into that person's name or email.
 */
export async function resolveCode(
  raw: string | null,
): Promise<{ id: string; code: string; ownerKind: string } | null> {
  const code = normaliseCode(raw);
  if (!code) return null;

  const row = await db.query.referralCodes.findFirst({
    where: and(eq(referralCodes.code, code), eq(referralCodes.isActive, true)),
  });

  if (!row) return null;
  return { id: row.id, code: row.code, ownerKind: row.ownerKind };
}

/** Counts a visit. Best-effort: a failed counter must not break a page. */
export async function countVisit(codeId: string): Promise<void> {
  try {
    await db
      .update(referralCodes)
      .set({ visitCount: sql`${referralCodes.visitCount} + 1` })
      .where(eq(referralCodes.id, codeId));
  } catch (error) {
    logger.warn("referral visit not counted", { codeId, error });
  }
}

/* -------------------------------------------------------------------------
 * Attribution
 * ---------------------------------------------------------------------- */

export type AttributionRefusal = "unknown_code" | "already_referred" | "blocked";

export type AttributionResult =
  | { ok: true; referral: Referral; fraudState: string }
  | { ok: false; reason: AttributionRefusal; reasons?: readonly FraudRule[] };

/**
 * Attaches a new account to the code it arrived with.
 *
 * Runs the anti-abuse rules at this point rather than at payout, so a blocked
 * referral never looks earned to anybody. A blocked row is still written: the
 * record of an attempt is worth keeping, and a silent absence is not something
 * support can investigate.
 */
export async function attributeSignup(input: {
  code: string;
  userId: string;
  email: string;
  ip?: string | null;
  now?: Date;
}): Promise<AttributionResult> {
  const now = input.now ?? new Date();
  const resolved = await resolveCode(input.code);
  if (!resolved) return { ok: false, reason: "unknown_code" };

  const [codeRow, referred] = await Promise.all([
    db.query.referralCodes.findFirst({ where: eq(referralCodes.id, resolved.id) }),
    db.query.users.findFirst({ where: eq(users.id, input.userId) }),
  ]);

  if (!codeRow || !referred) return { ok: false, reason: "unknown_code" };

  const existing = await db.query.referrals.findFirst({
    where: eq(referrals.referredUserId, input.userId),
  });
  if (existing) return { ok: false, reason: "already_referred" };

  // Checked first: it is the cheapest rule and the most certain one, and
  // there is no reason to hash anybody's identity for a referral that is
  // refused outright. The schema forbids the row too -- `referrals_not_self`
  // is a CHECK -- so attempting to record the attempt would raise a
  // constraint violation rather than produce evidence.
  if (codeRow.ownerUserId === input.userId) {
    logger.info("self-referral refused", { codeId: codeRow.id });
    return { ok: false, reason: "blocked", reasons: ["self_referral"] };
  }

  const secret = fingerprintSecret();

  const referrer = codeRow.ownerUserId
    ? await db.query.users.findFirst({ where: eq(users.id, codeRow.ownerUserId) })
    : null;

  // Does the code's owner already owe their own account to this person?
  const loop = codeRow.ownerUserId
    ? await db.query.referrals.findFirst({
        where: eq(referrals.referredUserId, codeRow.ownerUserId),
      })
    : null;

  const ownerIsActive = await isOwnerActive(codeRow);

  const referredEmailHash = secret ? emailFingerprint(referred.email, secret) : null;
  const referrerEmailHash =
    secret && referrer ? emailFingerprint(referrer.email, secret) : null;
  const referredIpHash = secret ? ipFingerprint(input.ip ?? null, secret) : null;

  // The referrer's own signup fingerprint, from their referral row if they
  // have one. Absent for the first customer in a chain, which is correct:
  // there is nothing to compare against.
  const referrerIpHash = codeRow.ownerUserId
    ? ((
        await db.query.referrals.findFirst({
          where: eq(referrals.referredUserId, codeRow.ownerUserId),
        })
      )?.signupIpHash ?? null)
    : null;

  const verdict = assessReferral({
    referrerUserId: codeRow.ownerUserId,
    referredUserId: input.userId,
    referrerEmailHash,
    referredEmailHash,
    referrerIpHash,
    referredIpHash,
    ownerWasReferredByReferee: loop?.codeId
      ? await isCodeOwnedBy(loop.codeId, input.userId)
      : false,
    refereeAlreadyReferred: false,
    ownerIsActive,
    codeCreatedAt: codeRow.createdAt,
    refereeSignedUpAt: referred.createdAt,
  });

  const [created] = await db
    .insert(referrals)
    .values({
      codeId: codeRow.id,
      referrerUserId: codeRow.ownerUserId,
      referredUserId: input.userId,
      status: "signed_up",
      fraudState: verdict.state === "blocked" ? "blocked" : verdict.state,
      fraudReasons: [...verdict.reasons],
      signupIpHash: referredIpHash,
      signupEmailHash: referredEmailHash,
      expiresAt: new Date(now.getTime() + ATTRIBUTION_WINDOW_DAYS * 86_400_000),
    })
    .returning();

  if (!created) throw new ApiError("internal_error", "That referral was not saved.");

  if (verdict.state !== "clear") {
    logger.warn("referral flagged at signup", {
      referralId: created.id,
      state: verdict.state,
      reasons: verdict.reasons,
    });
  }

  return verdict.state === "blocked"
    ? { ok: false, reason: "blocked", reasons: verdict.reasons }
    : { ok: true, referral: created, fraudState: verdict.state };
}

/** True when the code's owning account is in good standing. */
async function isOwnerActive(code: ReferralCode): Promise<boolean> {
  if (!code.isActive) return false;

  if (code.ownerKind === "partner" && code.ownerPartnerId) {
    const partner = await db.query.partners.findFirst({
      where: eq(partners.id, code.ownerPartnerId),
    });
    return partner?.status === "approved";
  }

  if (code.ownerKind === "affiliate" && code.ownerAffiliateId) {
    const affiliate = await db.query.affiliates.findFirst({
      where: eq(affiliates.id, code.ownerAffiliateId),
    });
    return affiliate?.status === "approved";
  }

  return true;
}

async function isCodeOwnedBy(codeId: string, userId: string): Promise<boolean> {
  const code = await db.query.referralCodes.findFirst({
    where: eq(referralCodes.id, codeId),
  });
  return code?.ownerUserId === userId;
}

/* -------------------------------------------------------------------------
 * Conversion
 * ---------------------------------------------------------------------- */

export interface ConversionOutcome {
  converted: boolean;
  referralId?: string;
  /** Why not, when it did not. */
  reason?: "no_referral" | "already_converted" | "blocked" | "no_order";
}

/**
 * Converts a referral when the referred customer's build starts.
 *
 * Called from the build-start transition rather than from an event subscriber:
 * the bus has no production registration point, and a reward that depends on a
 * handler being registered is a reward that silently stops.
 *
 * Re-runs the anti-abuse rules with the order in hand. Facts that did not
 * exist at signup -- what the order was actually worth, whether the window has
 * since closed -- can only be checked now.
 */
export async function convertReferralForProject(
  projectId: string,
  now: Date = new Date(),
): Promise<ConversionOutcome> {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
  if (!project) return { converted: false, reason: "no_referral" };

  const referral = await db.query.referrals.findFirst({
    where: and(
      eq(referrals.referredUserId, project.ownerId),
      isNull(referrals.convertedAt),
    ),
  });
  if (!referral) return { converted: false, reason: "no_referral" };
  if (referral.status === "converted") {
    return { converted: false, reason: "already_converted" };
  }

  // The paid order behind this project. Read separately rather than through a
  // relation because the commission rate is applied to its frozen total, and
  // the query should say plainly which order that is.
  const paidOrder = await db.query.orders.findFirst({
    where: and(eq(orders.projectId, project.id), isNotNull(orders.paidAt)),
  });
  if (!paidOrder) return { converted: false, reason: "no_order" };

  const codeRow = await db.query.referralCodes.findFirst({
    where: eq(referralCodes.id, referral.codeId),
  });
  if (!codeRow) return { converted: false, reason: "no_referral" };

  const verdict = assessReferral({
    referrerUserId: referral.referrerUserId,
    referredUserId: referral.referredUserId,
    referrerEmailHash: null,
    referredEmailHash: null,
    referrerIpHash: null,
    referredIpHash: null,
    ownerWasReferredByReferee: false,
    refereeAlreadyReferred: false,
    ownerIsActive: await isOwnerActive(codeRow),
    codeCreatedAt: codeRow.createdAt,
    refereeSignedUpAt: referral.createdAt,
    orderTotalMinorUnits: paidOrder.totalMinorUnits,
    expiresAt: referral.expiresAt,
    convertedAt: now,
  });

  // Signup-time findings are kept: a flag raised then does not evaporate
  // because the second pass had less to look at.
  const reasons = [...new Set([...referral.fraudReasons, ...verdict.reasons])];
  const blocked = referral.fraudState === "blocked" || verdict.state === "blocked";

  const fraudState = blocked
    ? ("blocked" as const)
    : referral.fraudState === "cleared"
      ? ("cleared" as const)
      : reasons.length > 0
        ? ("flagged" as const)
        : ("clear" as const);

  // The conversion is recorded whatever the verdict. A blocked referral that
  // genuinely converted is a fact; what it does not get is a reward.
  const [converted] = await db
    .update(referrals)
    .set({
      status: "converted",
      convertedAt: now,
      convertedProjectId: project.id,
      fraudState,
      fraudReasons: reasons,
      updatedAt: now,
    })
    .where(and(eq(referrals.id, referral.id), isNull(referrals.convertedAt)))
    .returning();

  if (!converted) return { converted: false, reason: "already_converted" };

  if (!isPayable(fraudState, "converted")) {
    logger.warn("referral converted but not payable", {
      referralId: converted.id,
      fraudState,
      reasons,
    });
    return { converted: true, referralId: converted.id, reason: "blocked" };
  }

  // Customer codes pay credit; partner and affiliate codes earn a commission.
  // Both run from this one conversion point, so "what did this referral earn"
  // has a single answer whoever owned the code.
  await payReferralReward(converted, paidOrder.id, now);

  const { raiseCommission } = await import("./partners");
  await raiseCommission({
    referralId: converted.id,
    orderId: paidOrder.id,
    grossMinorUnits: paidOrder.totalMinorUnits,
    currency: paidOrder.currency,
  });

  return { converted: true, referralId: converted.id };
}

/**
 * Grants credit to both sides.
 *
 * Idempotent through the ledger's own key, so a retried conversion cannot pay
 * twice. Only customer-owned codes pay credit; partner and affiliate codes
 * earn a commission instead, raised by `server/growth/commissions`.
 */
async function payReferralReward(
  referral: Referral,
  orderId: string,
  now: Date,
): Promise<void> {
  const code = await db.query.referralCodes.findFirst({
    where: eq(referralCodes.id, referral.codeId),
  });
  if (!code || code.ownerKind !== "customer" || !code.ownerUserId) return;

  const expiresAt = new Date(now.getTime() + REFERRAL.expiryMonths * 30 * 86_400_000);

  const [referrerGrant, refereeGrant] = await Promise.all([
    recordMovement({
      ownerId: code.ownerUserId,
      kind: "awarded",
      minutes: REFERRAL_REWARD_MINUTES,
      description: "Referral reward",
      subjectType: "referral",
      subjectId: referral.id,
      expiresAt,
      idempotencyKey: `referral:${referral.id}:referrer`,
    }),
    recordMovement({
      ownerId: referral.referredUserId,
      kind: "awarded",
      minutes: REFERRAL_REWARD_MINUTES,
      description: "Welcome credit",
      subjectType: "referral",
      subjectId: referral.id,
      expiresAt,
      idempotencyKey: `referral:${referral.id}:referee`,
    }),
  ]);

  if (!referrerGrant.ok || !refereeGrant.ok) {
    logger.error("referral reward could not be granted", {
      referralId: referral.id,
      referrer: referrerGrant.ok ? "ok" : referrerGrant.reason,
      referee: refereeGrant.ok ? "ok" : refereeGrant.reason,
    });
    return;
  }

  await db
    .update(referrals)
    .set({
      rewardState: "granted",
      rewardMinutes: REFERRAL_REWARD_MINUTES,
      refereeRewardMinutes: REFERRAL_REWARD_MINUTES,
      updatedAt: now,
    })
    .where(eq(referrals.id, referral.id));

  logger.info("referral reward granted", { referralId: referral.id, orderId });
}

/**
 * Takes a reward back when the order behind it is refunded.
 *
 * Deducts the same amount through a `refunded`-direction entry rather than
 * deleting the grant: the ledger is append-only, and the customer is owed the
 * record of both movements. A balance already spent cannot go negative, so an
 * unrecoverable clawback is logged rather than forced.
 */
export async function clawBackReward(
  referralId: string,
  reason: string,
  context: AuthContext,
): Promise<{ ok: boolean }> {
  if (!context.can("billing:manage")) {
    throw new ApiError("not_found", "Not found.");
  }

  const referral = await db.query.referrals.findFirst({
    where: eq(referrals.id, referralId),
  });
  if (!referral || referral.rewardState !== "granted") return { ok: false };

  const code = await db.query.referralCodes.findFirst({
    where: eq(referralCodes.id, referral.codeId),
  });

  const minutes = referral.rewardMinutes ?? 0;
  const results = await Promise.all(
    [
      code?.ownerUserId ? { ownerId: code.ownerUserId, side: "referrer" } : null,
      { ownerId: referral.referredUserId, side: "referee" },
    ]
      .filter((entry): entry is { ownerId: string; side: string } => entry !== null)
      .map((entry) =>
        recordMovement({
          ownerId: entry.ownerId,
          kind: "adjusted",
          minutes,
          adjustmentSign: -1,
          reason,
          description: "Referral reward reversed",
          subjectType: "referral",
          subjectId: referral.id,
          idempotencyKey: `referral:${referral.id}:clawback:${entry.side}`,
          actorUserId: context.user.id,
        }),
      ),
  );

  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    // A balance that has already been spent cannot be clawed back without
    // putting somebody into debt, which is not a thing this platform does.
    logger.error("referral clawback incomplete", {
      referralId,
      failures: failed.map((result) => (result.ok ? null : result.reason)),
    });
  }

  await db
    .update(referrals)
    .set({ rewardState: "clawed_back", updatedAt: new Date() })
    .where(eq(referrals.id, referralId));

  await recordAudit({
    category: "finance",
    action: "referral.reward_clawed_back",
    actor: context,
    subjectType: "referral",
    subjectId: referralId,
    before: { rewardState: "granted" },
    after: { rewardState: "clawed_back", minutes },
    reason,
  });

  return { ok: failed.length === 0 };
}

/* -------------------------------------------------------------------------
 * Reading
 * ---------------------------------------------------------------------- */

export interface ReferralSummary {
  code: string;
  url: string;
  visits: number;
  signedUp: number;
  converted: number;
  /** Credit actually received, in minutes. */
  earnedMinutes: number;
  /** Converted but held for review. Stated rather than hidden. */
  pending: number;
}

/** The referrer's own view. Never exposes who the referred people are. */
export async function referralSummaryFor(
  context: AuthContext,
  origin: string,
): Promise<ReferralSummary> {
  const code = await myReferralCode(context);

  const rows = await db
    .select({
      status: referrals.status,
      fraudState: referrals.fraudState,
      rewardState: referrals.rewardState,
      rewardMinutes: referrals.rewardMinutes,
    })
    .from(referrals)
    .where(eq(referrals.codeId, code.id));

  return {
    code: code.code,
    url: `${origin}/r/${code.code}`,
    visits: code.visitCount,
    signedUp: rows.length,
    converted: rows.filter((row) => row.status === "converted").length,
    earnedMinutes: rows
      .filter((row) => row.rewardState === "granted")
      .reduce((total, row) => total + (row.rewardMinutes ?? 0), 0),
    // Deliberately counted and shown. A referral held for review that looked
    // like it had simply not happened is a support ticket.
    pending: rows.filter(
      (row) => row.status === "converted" && row.rewardState === "none",
    ).length,
  };
}
