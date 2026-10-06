import { money, type Money } from "@/lib/pricing/money";
import type { DiscountRule } from "./catalog";
import type { AppliedDiscount } from "./types";

/**
 * Applying a coupon.
 *
 * Every constraint is checked here, server-side, against the rule loaded from
 * the database -- never against anything the browser described. The browser
 * supplies a string; it does not get to say what that string is worth.
 *
 * A code that fails any check is simply not applied. It is never partially
 * applied, never silently clamped to a different code, and never reduces a
 * total below zero.
 */

export type DiscountRefusal =
  | "no_code"
  | "unknown"
  | "inactive"
  | "not_started"
  | "expired"
  | "exhausted"
  | "below_minimum"
  | "wrong_build_type";

export interface DiscountOutcome {
  amount: Money;
  applied: AppliedDiscount | null;
  refusal: DiscountRefusal | null;
}

export interface ApplyDiscountInput {
  subtotal: Money;
  /** The rule loaded for the code the customer supplied, if any. */
  discount: DiscountRule | null;
  code: string | null;
  buildType: string;
  now: Date;
}

/** Codes are compared upper-case and trimmed, so "  save10 " matches SAVE10. */
export function normaliseCode(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toUpperCase();
  return trimmed ? trimmed : null;
}

export function applyDiscount(input: ApplyDiscountInput): DiscountOutcome {
  const { subtotal, discount, now, buildType } = input;
  const nothing = money(0, subtotal.currency);
  const code = normaliseCode(input.code);

  if (!code) return { amount: nothing, applied: null, refusal: "no_code" };
  if (!discount || discount.code !== code) {
    return { amount: nothing, applied: null, refusal: "unknown" };
  }
  if (!discount.isActive) {
    return { amount: nothing, applied: null, refusal: "inactive" };
  }
  if (discount.startsAt && now < discount.startsAt) {
    return { amount: nothing, applied: null, refusal: "not_started" };
  }
  if (discount.endsAt && now > discount.endsAt) {
    return { amount: nothing, applied: null, refusal: "expired" };
  }
  if (discount.maxRedemptions !== null && discount.timesUsed >= discount.maxRedemptions) {
    return { amount: nothing, applied: null, refusal: "exhausted" };
  }
  if (
    discount.appliesToBuildTypes.length > 0 &&
    !discount.appliesToBuildTypes.includes(buildType)
  ) {
    return { amount: nothing, applied: null, refusal: "wrong_build_type" };
  }
  if (
    discount.minOrderMinorUnits !== null &&
    subtotal.minorUnits < discount.minOrderMinorUnits
  ) {
    return { amount: nothing, applied: null, refusal: "below_minimum" };
  }

  let reduction =
    discount.kind === "percentage"
      ? Math.round((subtotal.minorUnits * discount.value) / 100)
      : discount.value;

  if (discount.maxDiscountMinorUnits !== null) {
    reduction = Math.min(reduction, discount.maxDiscountMinorUnits);
  }

  // Never below zero, and never more than the order is worth: a coupon that
  // exceeds the total is a refund, which is not what a coupon is.
  reduction = Math.max(0, Math.min(reduction, subtotal.minorUnits));

  if (reduction === 0) {
    return { amount: nothing, applied: null, refusal: "below_minimum" };
  }

  return {
    amount: money(reduction, subtotal.currency),
    applied: {
      code: discount.code,
      kind: discount.kind,
      amount: money(reduction, subtotal.currency),
      description: discount.description,
    },
    refusal: null,
  };
}
