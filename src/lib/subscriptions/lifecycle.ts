import type { BillingInterval, SubscriptionStatus } from "@/db/schema/enums";

/**
 * The subscription state machine.
 *
 * Pure and explicit. A subscription decides whether somebody's site stays up
 * and whether their card gets charged, so "what can follow what" is written
 * down rather than left to whichever branch happens to run.
 *
 * The one rule everything else serves: **a customer who has paid for a period
 * keeps it.** Cancelling is not destructive; it sets the subscription to stop
 * at the boundary it was paid to. Cutting a site off on the day someone
 * cancels, having taken their money for the month, would be theft.
 */

/** Which statuses may follow which. Anything absent is refused. */
export const ALLOWED_TRANSITIONS: Record<
  SubscriptionStatus,
  readonly SubscriptionStatus[]
> = {
  trialing: ["active", "cancelled", "expired"],
  active: ["past_due", "paused", "cancelled", "expired"],
  // Recovery is the point of modelling this separately from cancelled: a
  // failed card is usually a card problem, not a decision to leave.
  past_due: ["active", "cancelled", "expired"],
  paused: ["active", "cancelled", "expired"],
  // Terminal. A returning customer starts a new subscription, so the record of
  // what they had before stays intact.
  cancelled: [],
  expired: [],
};

export function canTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Statuses in which the service is actually delivered. */
export const SERVING_STATUSES: readonly SubscriptionStatus[] = [
  "trialing",
  "active",
  // Still served while a payment problem is being resolved. Suspending on the
  // first failed charge turns a declined card into an outage.
  "past_due",
];

export function isServing(status: SubscriptionStatus): boolean {
  return SERVING_STATUSES.includes(status);
}

/** Statuses from which nothing further happens. */
export function isTerminal(status: SubscriptionStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}

/**
 * The end of a billing period.
 *
 * Calendar months, not thirty days: somebody who subscribes on the 3rd is
 * billed on the 3rd. A month shorter than the anchor day clamps to its last
 * day, so the 31st of January renews on the 28th of February and then returns
 * to the 31st rather than drifting earlier every month.
 */
export function nextPeriodEnd(
  start: Date,
  interval: BillingInterval,
  /** The original day of month, so a clamped month does not shift the anchor. */
  anchorDay?: number,
): Date {
  const day = anchorDay ?? start.getUTCDate();
  const months = interval === "yearly" ? 12 : 1;

  const target = new Date(
    Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth() + months,
      1,
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
      start.getUTCMilliseconds(),
    ),
  );

  const daysInTarget = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();

  target.setUTCDate(Math.min(day, daysInTarget));
  return target;
}

export type ChangeKind = "upgrade" | "downgrade" | "same";

/**
 * Which direction a plan change goes.
 *
 * Decided on price rather than on an ordering of plan names, because the plan
 * list is editable data and a name tells you nothing about what it costs.
 */
export function changeKind(
  currentPriceMinorUnits: number,
  nextPriceMinorUnits: number,
): ChangeKind {
  if (nextPriceMinorUnits > currentPriceMinorUnits) return "upgrade";
  if (nextPriceMinorUnits < currentPriceMinorUnits) return "downgrade";
  return "same";
}

export interface PlanChangePlan {
  kind: ChangeKind;
  /** True when the new plan starts now rather than at the next renewal. */
  immediate: boolean;
  /** What the customer owes today, in minor units. Zero for a downgrade. */
  dueNowMinorUnits: number;
  effectiveAt: Date;
}

/**
 * What happens when a customer changes plan.
 *
 * An **upgrade is immediate** and charges the remainder of the period at the
 * difference, because somebody paying more expects the thing they paid for
 * today. A **downgrade takes effect at the next renewal** and refunds nothing:
 * they keep the plan they already paid for until it runs out, which is both
 * fair and far simpler than a mid-period credit nobody can reconcile.
 */
export function planChange(input: {
  currentPriceMinorUnits: number;
  nextPriceMinorUnits: number;
  periodStart: Date;
  periodEnd: Date;
  now: Date;
}): PlanChangePlan {
  const kind = changeKind(input.currentPriceMinorUnits, input.nextPriceMinorUnits);

  if (kind !== "upgrade") {
    return {
      kind,
      immediate: false,
      dueNowMinorUnits: 0,
      effectiveAt: input.periodEnd,
    };
  }

  const total = input.periodEnd.getTime() - input.periodStart.getTime();
  const remaining = Math.max(0, input.periodEnd.getTime() - input.now.getTime());
  const fraction = total > 0 ? remaining / total : 0;

  const difference = input.nextPriceMinorUnits - input.currentPriceMinorUnits;

  return {
    kind,
    immediate: true,
    // Rounded down, so a rounding error is never in our favour.
    dueNowMinorUnits: Math.floor(difference * fraction),
    effectiveAt: input.now,
  };
}

/**
 * When a cancellation actually ends service.
 *
 * Always the end of the paid period. There is no parameter for ending it
 * sooner, because there is no circumstance in which taking somebody's money
 * for a month and then stopping early is correct.
 */
export function cancellationEffectiveAt(periodEnd: Date): Date {
  return periodEnd;
}
