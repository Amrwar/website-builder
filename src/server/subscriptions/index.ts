import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  maintenancePlans,
  subscriptionEvents,
  subscriptions,
  type MaintenancePlanRow,
  type Subscription,
} from "@/db/schema";
import { MAINTENANCE_PLANS } from "@/config/maintenance";
import type { BillingInterval, SubscriptionStatus } from "@/db/schema/enums";
import { ApiError } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import {
  canTransition,
  cancellationEffectiveAt,
  nextPeriodEnd,
  planChange,
  type PlanChangePlan,
} from "@/lib/subscriptions/lifecycle";
import type { AuthContext } from "@/server/auth";
import { nextDocumentNumber } from "@/server/commerce/numbering";
import { recordMovement } from "@/server/credits";
import { emit } from "@/server/events/bus";

/**
 * Maintenance subscriptions.
 *
 * Plans are configuration, following the catalogue pattern from Phase 10:
 * `config/maintenance` is the seed and the fallback, an empty table means "use
 * what shipped", and nothing is hard-coded into a component.
 *
 * The one rule everything here serves: **a customer who has paid for a period
 * keeps it.** Cancelling sets the subscription to stop at the boundary it was
 * paid to; it does not stop service that day. Every state change is also
 * recorded append-only, because "I was charged after I cancelled" is a dispute
 * that current state alone cannot settle.
 */

/* -------------------------------------------------------------------------
 * Plans
 * ---------------------------------------------------------------------- */

export interface PlanView {
  key: string;
  priceMinorUnits: number;
  currency: string;
  interval: BillingInterval;
  featureKeys: readonly string[];
  includedCreditMinutes: number;
  trialDays: number;
  isRecommended: boolean;
}

const CACHE_MS = 30_000;
let cached: { at: number; plans: readonly PlanView[] } | null = null;

export function invalidatePlanCache(): void {
  cached = null;
}

/** The shipped plans, used when nothing has been imported. */
function shippedPlans(): readonly PlanView[] {
  return MAINTENANCE_PLANS.map((plan) => ({
    key: plan.id,
    priceMinorUnits: plan.price.minorUnits,
    currency: plan.price.currency,
    interval: "monthly" as const,
    featureKeys: plan.featureKeys,
    // The top plan advertises build credit; the grant has to come from
    // somewhere, and it is here rather than in a component.
    includedCreditMinutes: plan.id === "priority" ? 120 : 0,
    trialDays: 0,
    isRecommended: plan.recommended,
  }));
}

export async function loadPlans(): Promise<readonly PlanView[]> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.plans;

  try {
    const rows = await db
      .select()
      .from(maintenancePlans)
      .where(eq(maintenancePlans.isActive, true))
      .orderBy(asc(maintenancePlans.sortOrder));

    const plans: readonly PlanView[] =
      rows.length === 0
        ? shippedPlans()
        : rows.map((row: MaintenancePlanRow) => ({
            key: row.key,
            priceMinorUnits: row.priceMinorUnits,
            currency: row.currency,
            interval: row.interval,
            featureKeys: row.featureKeys,
            includedCreditMinutes: row.includedCreditMinutes,
            trialDays: row.trialDays,
            isRecommended: row.isRecommended,
          }));

    cached = { at: Date.now(), plans };
    return plans;
  } catch (error) {
    logger.error("maintenance plans load failed; using shipped defaults", { error });
    return shippedPlans();
  }
}

export async function planByKey(key: string): Promise<PlanView | undefined> {
  return (await loadPlans()).find((plan) => plan.key === key);
}

/* -------------------------------------------------------------------------
 * Reading
 * ---------------------------------------------------------------------- */

export async function subscriptionsFor(
  ownerId: string,
  context: AuthContext,
): Promise<Subscription[]> {
  if (ownerId !== context.user.id && !context.can("customer:read")) {
    throw new ApiError("not_found", "Not found.");
  }

  return db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.ownerId, ownerId))
    .orderBy(desc(subscriptions.createdAt));
}

export async function subscriptionForProject(
  projectId: string,
): Promise<Subscription | undefined> {
  return db.query.subscriptions.findFirst({
    where: eq(subscriptions.projectId, projectId),
  });
}

/** The lifecycle record, for a billing history a customer can read. */
export async function historyFor(subscriptionId: string) {
  return db
    .select()
    .from(subscriptionEvents)
    .where(eq(subscriptionEvents.subscriptionId, subscriptionId))
    .orderBy(desc(subscriptionEvents.occurredAt));
}

/* -------------------------------------------------------------------------
 * Writing
 * ---------------------------------------------------------------------- */

async function recordEvent(input: {
  subscriptionId: string;
  action: string;
  fromStatus?: SubscriptionStatus | null;
  toStatus?: SubscriptionStatus | null;
  fromPlanKey?: string | null;
  toPlanKey?: string | null;
  actorUserId?: string | null;
  note?: string | null;
}): Promise<void> {
  try {
    await db.insert(subscriptionEvents).values({
      subscriptionId: input.subscriptionId,
      action: input.action,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      fromPlanKey: input.fromPlanKey ?? null,
      toPlanKey: input.toPlanKey ?? null,
      actorUserId: input.actorUserId ?? null,
      note: input.note ?? null,
    });
  } catch (error) {
    // Never throws, for the same reason the audit log never throws: losing the
    // record of a change is bad; rolling back the change because the record
    // failed is worse.
    logger.error("SUBSCRIPTION EVENT WRITE FAILED", { ...input, error });
  }
}

export type SubscriptionRefusal =
  "unknown_plan" | "already_subscribed" | "not_found" | "terminal" | "invalid_transition";

export type SubscriptionResult<T> =
  { ok: true; value: T } | { ok: false; reason: SubscriptionRefusal };

/**
 * Starts a subscription.
 *
 * The price is frozen on the row at purchase, so a later change to the plan's
 * published price does not alter what this customer agreed to -- the same rule
 * the order pricing snapshot enforces for builds.
 */
export async function startSubscription(
  input: { planKey: string; projectId?: string | null },
  context: AuthContext,
  now: Date = new Date(),
): Promise<SubscriptionResult<Subscription>> {
  const plan = await planByKey(input.planKey);
  if (!plan) return { ok: false, reason: "unknown_plan" };

  if (input.projectId) {
    const existing = await db.query.subscriptions.findFirst({
      where: and(
        eq(subscriptions.projectId, input.projectId),
        eq(subscriptions.status, "active"),
      ),
    });
    if (existing) return { ok: false, reason: "already_subscribed" };
  }

  const trialEndsAt =
    plan.trialDays > 0 ? new Date(now.getTime() + plan.trialDays * 86_400_000) : null;

  const periodStart = trialEndsAt ?? now;

  // Numbered inside the transaction, so a subscription that fails to save
  // does not consume a reference and leave a gap in the series.
  const created = await db.transaction(async (tx) => {
    const reference = await nextDocumentNumber(tx, "subscription");

    const [row] = await tx
      .insert(subscriptions)
      .values({
        reference,
        // Scoped to the session, never to a payload: a server action is a public
        // endpoint and the owner is not something a caller may name.
        ownerId: context.user.id,
        projectId: input.projectId ?? null,
        planKey: plan.key,
        status: trialEndsAt ? "trialing" : "active",
        interval: plan.interval,
        priceMinorUnits: plan.priceMinorUnits,
        currency: plan.currency as Subscription["currency"],
        startedAt: now,
        trialEndsAt,
        currentPeriodStart: periodStart,
        currentPeriodEnd: nextPeriodEnd(periodStart, plan.interval),
      })
      .returning();

    return row;
  });

  if (!created) throw new ApiError("internal_error", "That subscription was not saved.");

  await recordEvent({
    subscriptionId: created.id,
    action: "subscription.started",
    toStatus: created.status,
    toPlanKey: plan.key,
    actorUserId: context.user.id,
  });

  if (input.projectId) {
    await emit({
      name: "subscription.started",
      projectId: input.projectId,
      actorType: "customer",
      actorId: context.user.id,
      payload: {
        subscriptionId: created.id,
        reference: created.reference,
        planKey: plan.key,
        trialEndsAt: trialEndsAt?.toISOString() ?? null,
      },
    });
  }

  await grantIncludedCredit(created, plan, context.user.id);

  return { ok: true, value: created };
}

/**
 * Grants the credit a plan includes for the current period.
 *
 * Keyed on the subscription and the period start, so a retried call -- a
 * double-clicked renewal, a replayed webhook -- lands once. Credit is money
 * somebody paid for; granting it twice is as wrong as granting it never.
 */
async function grantIncludedCredit(
  subscription: Subscription,
  plan: PlanView,
  actorUserId: string | null,
): Promise<void> {
  if (plan.includedCreditMinutes <= 0) return;

  await recordMovement({
    ownerId: subscription.ownerId,
    kind: "granted",
    minutes: plan.includedCreditMinutes,
    description: `Included with ${plan.key}`,
    subjectType: "subscription",
    subjectId: subscription.id,
    // Granted credit lapses at the end of the period it was given for; it is
    // an allowance, not a purchase.
    expiresAt: subscription.currentPeriodEnd,
    idempotencyKey: `sub:${subscription.id}:${subscription.currentPeriodStart.toISOString()}`,
    actorUserId,
  });
}

/** Loads a subscription the caller is allowed to act on. */
async function loadOwned(
  subscriptionId: string,
  context: AuthContext,
): Promise<Subscription | undefined> {
  const canManageAll = context.can("billing:manage");

  return db.query.subscriptions.findFirst({
    where: canManageAll
      ? eq(subscriptions.id, subscriptionId)
      : and(
          eq(subscriptions.id, subscriptionId),
          eq(subscriptions.ownerId, context.user.id),
        ),
  });
}

/**
 * What a plan change would cost, without making it.
 *
 * Exists because an upgrade takes money immediately, and charging somebody
 * before showing them the figure is not acceptable regardless of how small it
 * is. Writes nothing; the same `planChange` arithmetic that `changePlan` uses
 * decides both the preview and the charge, so they cannot disagree.
 */
export async function previewPlanChange(
  subscriptionId: string,
  nextPlanKey: string,
  context: AuthContext,
  now: Date = new Date(),
): Promise<SubscriptionResult<PlanChangePlan & { currency: string }>> {
  const current = await loadOwned(subscriptionId, context);
  if (!current) return { ok: false, reason: "not_found" };

  const next = await planByKey(nextPlanKey);
  if (!next) return { ok: false, reason: "unknown_plan" };

  return {
    ok: true,
    value: {
      ...planChange({
        currentPriceMinorUnits: current.priceMinorUnits,
        nextPriceMinorUnits: next.priceMinorUnits,
        periodStart: current.currentPeriodStart,
        periodEnd: current.currentPeriodEnd,
        now,
      }),
      currency: current.currency,
    },
  };
}

/**
 * Changes plan.
 *
 * An upgrade takes effect immediately and charges the remainder of the period
 * at the difference. A downgrade takes effect at the next renewal and refunds
 * nothing: the customer keeps what they already paid for until it runs out,
 * which is fair and avoids a mid-period credit nobody can reconcile.
 */
export async function changePlan(
  subscriptionId: string,
  nextPlanKey: string,
  context: AuthContext,
  now: Date = new Date(),
): Promise<SubscriptionResult<{ subscription: Subscription; change: PlanChangePlan }>> {
  const current = await loadOwned(subscriptionId, context);
  if (!current) return { ok: false, reason: "not_found" };
  if (current.status === "cancelled" || current.status === "expired") {
    return { ok: false, reason: "terminal" };
  }

  const next = await planByKey(nextPlanKey);
  if (!next) return { ok: false, reason: "unknown_plan" };

  const change = planChange({
    currentPriceMinorUnits: current.priceMinorUnits,
    nextPriceMinorUnits: next.priceMinorUnits,
    periodStart: current.currentPeriodStart,
    periodEnd: current.currentPeriodEnd,
    now,
  });

  const [updated] = await db
    .update(subscriptions)
    .set(
      change.immediate
        ? { planKey: next.key, priceMinorUnits: next.priceMinorUnits, updatedAt: now }
        : // A deferred change records the intent without touching the plan the
          // customer is currently being served and has already paid for.
          { updatedAt: now },
    )
    .where(eq(subscriptions.id, subscriptionId))
    .returning();

  if (!updated) return { ok: false, reason: "not_found" };

  await recordEvent({
    subscriptionId,
    action: change.immediate
      ? "subscription.upgraded"
      : "subscription.downgrade_scheduled",
    fromPlanKey: current.planKey,
    toPlanKey: next.key,
    actorUserId: context.user.id,
    note: `effective ${change.effectiveAt.toISOString()}`,
  });

  if (updated.projectId) {
    await emit({
      name: "subscription.changed",
      projectId: updated.projectId,
      actorType: "customer",
      actorId: context.user.id,
      payload: {
        subscriptionId,
        fromPlanKey: current.planKey,
        toPlanKey: next.key,
        kind: change.kind,
        effectiveAt: change.effectiveAt.toISOString(),
      },
    });
  }

  return { ok: true, value: { subscription: updated, change } };
}

/**
 * Cancels at the end of the paid period.
 *
 * There is no parameter for ending it sooner. Taking somebody's money for a
 * month and then stopping their service early is not a feature.
 */
export async function cancelSubscription(
  subscriptionId: string,
  reason: string | null,
  context: AuthContext,
): Promise<SubscriptionResult<{ subscription: Subscription; endsAt: Date }>> {
  const current = await loadOwned(subscriptionId, context);
  if (!current) return { ok: false, reason: "not_found" };
  if (!canTransition(current.status, "cancelled")) {
    return { ok: false, reason: "terminal" };
  }

  const endsAt = cancellationEffectiveAt(current.currentPeriodEnd);

  const [updated] = await db
    .update(subscriptions)
    .set({
      // Status stays as it is until the period actually ends. The sweep
      // retires it at the boundary; marking it cancelled now would read as
      // "service has stopped", which is not true yet.
      cancelAtPeriodEnd: true,
      cancelledAt: new Date(),
      cancellationReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, subscriptionId))
    .returning();

  if (!updated) return { ok: false, reason: "not_found" };

  await recordEvent({
    subscriptionId,
    action: "subscription.cancelled",
    fromStatus: current.status,
    actorUserId: context.user.id,
    note: reason,
  });

  if (updated.projectId) {
    await emit({
      name: "subscription.cancelled",
      projectId: updated.projectId,
      actorType: "customer",
      actorId: context.user.id,
      payload: {
        subscriptionId,
        effectiveAt: endsAt.toISOString(),
        reason,
      },
    });
  }

  return { ok: true, value: { subscription: updated, endsAt } };
}

/** Reverses a pending cancellation, while the period is still running. */
export async function resumeSubscription(
  subscriptionId: string,
  context: AuthContext,
): Promise<SubscriptionResult<Subscription>> {
  const current = await loadOwned(subscriptionId, context);
  if (!current) return { ok: false, reason: "not_found" };
  if (current.status === "cancelled" || current.status === "expired") {
    return { ok: false, reason: "terminal" };
  }

  const [updated] = await db
    .update(subscriptions)
    .set({
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      cancellationReason: null,
      status: current.status === "paused" ? "active" : current.status,
      pausedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, subscriptionId))
    .returning();

  if (!updated) return { ok: false, reason: "not_found" };

  await recordEvent({
    subscriptionId,
    action: "subscription.resumed",
    fromStatus: current.status,
    toStatus: updated.status,
    actorUserId: context.user.id,
  });

  return { ok: true, value: updated };
}

/**
 * Moves a subscription to a new status, enforcing the state machine.
 *
 * Staff-only, and refused when the machine does not allow it. Without the
 * check, a correction could resurrect a cancelled subscription and start
 * charging a card that nobody expects to be charged.
 */
export async function setStatus(
  subscriptionId: string,
  to: SubscriptionStatus,
  context: AuthContext,
  note?: string,
): Promise<SubscriptionResult<Subscription>> {
  if (!context.can("billing:manage")) {
    throw new ApiError("not_found", "Not found.");
  }

  const current = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, subscriptionId),
  });
  if (!current) return { ok: false, reason: "not_found" };
  if (!canTransition(current.status, to)) {
    return { ok: false, reason: "invalid_transition" };
  }

  const now = new Date();

  const [updated] = await db
    .update(subscriptions)
    .set({
      status: to,
      pausedAt: to === "paused" ? now : null,
      pastDueSince: to === "past_due" ? now : null,
      endedAt: to === "cancelled" || to === "expired" ? now : null,
      updatedAt: now,
    })
    .where(
      and(eq(subscriptions.id, subscriptionId), eq(subscriptions.status, current.status)),
    )
    .returning();

  if (!updated) return { ok: false, reason: "invalid_transition" };

  await recordEvent({
    subscriptionId,
    action: `subscription.${to}`,
    fromStatus: current.status,
    toStatus: to,
    actorUserId: context.user.id,
    note: note ?? null,
  });

  return { ok: true, value: updated };
}

/**
 * Advances a subscription into its next period.
 *
 * Called by the renewal sweep once a payment for the new period has actually
 * been taken. Grants the plan's included credit for the new period, keyed so a
 * retry cannot grant it twice.
 */
export async function renew(
  subscriptionId: string,
  now: Date = new Date(),
): Promise<SubscriptionResult<Subscription>> {
  const current = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, subscriptionId),
  });
  if (!current) return { ok: false, reason: "not_found" };

  const plan = await planByKey(current.planKey);

  // A cancellation that has reached its boundary ends here rather than
  // rolling into another period the customer did not ask for.
  if (current.cancelAtPeriodEnd) {
    const [ended] = await db
      .update(subscriptions)
      .set({ status: "cancelled", endedAt: now, updatedAt: now })
      .where(eq(subscriptions.id, subscriptionId))
      .returning();

    await recordEvent({
      subscriptionId,
      action: "subscription.ended",
      fromStatus: current.status,
      toStatus: "cancelled",
    });

    return ended ? { ok: true, value: ended } : { ok: false, reason: "not_found" };
  }

  const periodStart = current.currentPeriodEnd;
  const periodEnd = nextPeriodEnd(
    periodStart,
    current.interval,
    current.startedAt.getUTCDate(),
  );

  const [renewed] = await db
    .update(subscriptions)
    .set({
      status: "active",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      trialEndsAt: null,
      updatedAt: now,
    })
    .where(
      // Conditional on the period we read, so a sweep running twice advances
      // the subscription once.
      and(
        eq(subscriptions.id, subscriptionId),
        eq(subscriptions.currentPeriodEnd, current.currentPeriodEnd),
      ),
    )
    .returning();

  if (!renewed) return { ok: false, reason: "invalid_transition" };

  await recordEvent({
    subscriptionId,
    action: "subscription.renewed",
    fromStatus: current.status,
    toStatus: "active",
  });

  if (plan) await grantIncludedCredit(renewed, plan, null);

  return { ok: true, value: renewed };
}
