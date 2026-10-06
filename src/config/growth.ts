import type { PartnerKind } from "@/db/schema/enums";

/**
 * The growth programme's terms.
 *
 * Every figure a person could be paid is here, defined once, and read
 * everywhere -- the same rule the build prices follow. A commission rate
 * inlined in a service is a commercial decision hidden in an implementation.
 *
 * ────────────────────────────────────────────────────────────────────────
 * COMMERCIAL NOTE: the referral credit, both commission rates and the
 * attribution window are provisional and need sign-off. They are direct costs
 * per referred build, so they belong to the same decision as the tier ladder.
 * They are isolated here so approving them is a single edit.
 * ────────────────────────────────────────────────────────────────────────
 */

/**
 * What a referral earns a customer, in **build minutes**.
 *
 * Denominated in time rather than money for the same reason the credit ledger
 * is: credit earned today and spent in a year must buy the same amount of
 * work. `config/referral` still carries the headline figure the marketing page
 * quotes, which is what that credit is worth at today's prices.
 */
export const REFERRAL_REWARD_MINUTES = 120;

/**
 * How long an attribution lasts.
 *
 * Stated so the offer is not open-ended in either direction: a referrer who
 * sent somebody two years ago has not earned a commission on a build that
 * person decided on by themselves.
 */
export const ATTRIBUTION_WINDOW_DAYS = 90;

/** Default commission rates, in basis points. 1000 = 10%. */
export const COMMISSION_BASIS_POINTS: Record<"partner" | "affiliate", number> = {
  /** Agencies and consultants bring qualified, briefed work. */
  partner: 1500,
  affiliate: 1000,
};

/**
 * The lowest total that earns anything.
 *
 * Without a floor, a referred order discounted to almost nothing still pays a
 * full reward, which is a loss per conversion rather than a cost of growth.
 */
export const MINIMUM_CONVERTING_ORDER_MINOR_UNITS = 10_000;

/**
 * How long a payout must wait after conversion.
 *
 * A commission approved the same day a build starts can be paid before the
 * refund window closes, which is how a refunded order ends up having paid a
 * commission nobody can recover.
 */
export const COMMISSION_HOLD_DAYS = 30;

/** What kinds of partner the application form offers. */
export const PARTNER_KIND_IDS: readonly PartnerKind[] = [
  "agency",
  "freelancer",
  "consultant",
  "advisor",
];

/**
 * The alphabet referral codes are drawn from.
 *
 * Codes get read aloud, written on cards and retyped from memory, so no two
 * characters here are confusable with each other: of `0/O`, `1/I/L`, `5/S` and
 * `8/B`, at most one survives. Dropping only one of each pair keeps the code
 * space as large as it can be while still being unambiguous -- a code somebody
 * cannot transcribe is a referral nobody gets credit for.
 */
export const CODE_ALPHABET = "ACDEFGHJKMNPQRTUVWXY2346789";
export const CODE_LENGTH = 8;

/**
 * How many reviews the marketing page shows.
 *
 * Capped rather than paginated: a landing page is not a review site, and the
 * honest version of social proof is a handful of real ones, not a wall.
 */
export const PUBLIC_REVIEW_LIMIT = 6;

/** How many build-wall entries the home page shows before "see all". */
export const BUILD_WALL_PREVIEW_LIMIT = 6;
