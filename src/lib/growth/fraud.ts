import { MINIMUM_CONVERTING_ORDER_MINOR_UNITS } from "@/config/growth";

/**
 * Anti-abuse rules for referrals.
 *
 * Deterministic and explainable, the same discipline as the deadline-risk
 * engine. Every refusal names the rule that fired, because a referral held
 * back with no stated reason is a support ticket the customer is right to open
 * and nobody can answer.
 *
 * Nothing here guesses. These are facts the platform already holds — who owns
 * the code, who signed up, which fingerprints match, what the order was worth
 * — compared against stated rules. There is no scoring model and no threshold
 * anybody has to believe in.
 *
 * The rules split into two severities on purpose:
 *
 *  - **blocked** is certain. A person cannot refer themselves; there is no
 *    circumstance in which that is legitimate, so no human review is offered.
 *  - **flagged** is suspicious. Two signups from one household is how a real
 *    couple buys two websites, and refusing that outright would punish honest
 *    customers to catch dishonest ones. A person decides.
 */

export type FraudRule =
  /** The referrer and the referred account are the same person. */
  | "self_referral"
  /** The referred account's email folds to the referrer's. */
  | "same_email_identity"
  /** A refers B, and B already referred A. */
  | "referral_loop"
  /** Both accounts signed up from the same address prefix. */
  | "same_network"
  /** The referred account was created before the code existed. */
  | "backdated_signup"
  /** Attribution lapsed before anything converted. */
  | "outside_window"
  /** The converting order is too small to pay a reward on. */
  | "below_minimum_order"
  /** The code's owner is suspended, rejected or withdrawn. */
  | "inactive_owner"
  /** This person has already been referred by somebody else. */
  | "already_referred";

export type FraudSeverity = "block" | "flag";

export const RULE_SEVERITY: Record<FraudRule, FraudSeverity> = {
  self_referral: "block",
  same_email_identity: "block",
  referral_loop: "block",
  already_referred: "block",
  backdated_signup: "block",
  outside_window: "block",
  below_minimum_order: "block",
  inactive_owner: "block",
  // The only soft signal. Households, offices and shared wifi are ordinary.
  same_network: "flag",
};

/** Everything the rules need. Facts only; nothing is fetched here. */
export interface FraudInput {
  /** The code owner's user id, when the owner is a customer. */
  referrerUserId: string | null;
  referredUserId: string;

  referrerEmailHash: string | null;
  referredEmailHash: string | null;

  referrerIpHash: string | null;
  referredIpHash: string | null;

  /** True when the code's owner already has a referral from this person. */
  ownerWasReferredByReferee: boolean;
  /** True when this person is already attributed to some other code. */
  refereeAlreadyReferred: boolean;

  /** False when the owning account is suspended, rejected or the code is off. */
  ownerIsActive: boolean;

  codeCreatedAt: Date;
  refereeSignedUpAt: Date;

  /** Set once there is something to convert. */
  orderTotalMinorUnits?: number | null;
  /** The end of the attribution window, when one has been set. */
  expiresAt?: Date | null;
  convertedAt?: Date | null;
}

export interface FraudVerdict {
  state: "clear" | "flagged" | "blocked";
  /** Every rule that fired, in declaration order, so the output is stable. */
  reasons: readonly FraudRule[];
}

const ORDER: readonly FraudRule[] = [
  "self_referral",
  "same_email_identity",
  "already_referred",
  "referral_loop",
  "inactive_owner",
  "backdated_signup",
  "outside_window",
  "below_minimum_order",
  "same_network",
];

/**
 * Evaluates every rule.
 *
 * Returns all of them rather than stopping at the first, so one fix does not
 * simply reveal the next: somebody reviewing a flagged referral should see the
 * whole picture at once.
 */
export function assessReferral(input: FraudInput): FraudVerdict {
  const fired = new Set<FraudRule>();

  // The same account on both sides. No legitimate case exists.
  if (input.referrerUserId !== null && input.referrerUserId === input.referredUserId) {
    fired.add("self_referral");
  }

  // Two accounts, one mailbox. `normaliseEmail` has already folded the dots
  // and the plus-tags, so this catches the cheap version of a second identity.
  if (
    input.referrerEmailHash !== null &&
    input.referredEmailHash !== null &&
    input.referrerEmailHash === input.referredEmailHash
  ) {
    fired.add("same_email_identity");
  }

  if (input.refereeAlreadyReferred) fired.add("already_referred");

  // A referred B and B referred A. Paying both sides of that is paying two
  // people to introduce each other.
  if (input.ownerWasReferredByReferee) fired.add("referral_loop");

  if (!input.ownerIsActive) fired.add("inactive_owner");

  // An account that existed before the code did cannot have arrived through
  // it. This is what stops a code being applied retroactively to a customer
  // who found the platform on their own.
  if (input.refereeSignedUpAt < input.codeCreatedAt) fired.add("backdated_signup");

  const at = input.convertedAt ?? null;
  if (input.expiresAt && at && at > input.expiresAt) fired.add("outside_window");

  if (
    input.orderTotalMinorUnits !== undefined &&
    input.orderTotalMinorUnits !== null &&
    input.orderTotalMinorUnits < MINIMUM_CONVERTING_ORDER_MINOR_UNITS
  ) {
    fired.add("below_minimum_order");
  }

  // Soft. A household buying two websites looks exactly like this.
  if (
    input.referrerIpHash !== null &&
    input.referredIpHash !== null &&
    input.referrerIpHash === input.referredIpHash
  ) {
    fired.add("same_network");
  }

  const reasons = ORDER.filter((rule) => fired.has(rule));
  const blocked = reasons.some((rule) => RULE_SEVERITY[rule] === "block");

  return {
    state: blocked ? "blocked" : reasons.length > 0 ? "flagged" : "clear",
    reasons,
  };
}

/** True when a referral in this state may be paid. */
export function isPayable(fraudState: string, status: string): boolean {
  // "cleared" is a person having looked at a flag and released it, which is
  // exactly as payable as never having been flagged.
  return (fraudState === "clear" || fraudState === "cleared") && status === "converted";
}

/* -------------------------------------------------------------------------
 * Reviews
 * ---------------------------------------------------------------------- */

export type ReviewRefusal =
  | "not_delivered"
  | "not_the_customer"
  | "already_reviewed"
  | "invalid_rating"
  | "empty_body";

export interface ReviewEligibility {
  /** The project reached launch. Nothing earlier counts as delivered. */
  projectLaunchedAt: Date | null;
  projectOwnerId: string;
  authorUserId: string;
  alreadyExists: boolean;
}

/**
 * Whether somebody may review a project.
 *
 * Three conditions, and all of them are structural rather than editorial: the
 * work was actually delivered, the author is the person who paid for it, and
 * no review exists yet. A platform that lets anybody write a review about
 * anything has review spam; one that lets the customer write a second review
 * has a customer who can bury their own first one.
 */
export function canReview(input: ReviewEligibility): ReviewRefusal | null {
  if (input.projectLaunchedAt === null) return "not_delivered";
  if (input.projectOwnerId !== input.authorUserId) return "not_the_customer";
  if (input.alreadyExists) return "already_reviewed";
  return null;
}

/** Validates the content of a submitted review. */
export function validateReviewContent(
  rating: number,
  body: string,
): ReviewRefusal | null {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return "invalid_rating";
  if (body.trim().length < 10) return "empty_body";
  return null;
}

/* -------------------------------------------------------------------------
 * Commission
 * ---------------------------------------------------------------------- */

/**
 * What a conversion earns, in minor units.
 *
 * Takes the order total and a rate, and returns a figure. There is no input
 * through which a caller could propose an amount, which is what makes
 * commission manipulation impossible rather than merely validated against.
 *
 * Rounds **down**. A rounding error should never be in the platform's favour
 * by accident, and it should never be in the recipient's either: floor is the
 * only choice that is predictable in both directions.
 */
export function commissionFor(grossMinorUnits: number, rateBasisPoints: number): number {
  if (!Number.isFinite(grossMinorUnits) || grossMinorUnits <= 0) return 0;
  if (!Number.isFinite(rateBasisPoints) || rateBasisPoints <= 0) return 0;

  // Capped at the order value. A rate above 100% is a configuration mistake,
  // and paying out more than was taken in is not something to do quietly.
  const capped = Math.min(rateBasisPoints, 10_000);
  return Math.floor((grossMinorUnits * capped) / 10_000);
}

/**
 * Whether a commission has waited out the refund window.
 *
 * A commission approved the day a build starts can be paid before the customer
 * could possibly have asked for their money back, which is how a refunded
 * order ends up having paid a commission nobody can recover.
 */
export function isReleasable(convertedAt: Date, now: Date, holdDays: number): boolean {
  return now.getTime() - convertedAt.getTime() >= holdDays * 86_400_000;
}
