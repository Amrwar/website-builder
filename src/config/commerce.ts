/**
 * Commerce policy.
 *
 * The commercial rules of selling, kept apart from the mechanics of charging.
 */

/**
 * Tax.
 *
 * ── Deliberately off, and this is not an oversight ────────────────────────
 * Stripe Tax is **not** enabled and `automatic_tax` is **not** passed on any
 * Checkout Session. Stripe's own guidance is explicit that enabling automatic
 * tax without an active tax registration causes Stripe to calculate and
 * collect nothing while the integration believes tax is on -- the most common
 * way this goes wrong, and one that surfaces as an unpaid liability rather
 * than as an error.
 *
 * No registration has been configured for this business. So tax is modelled
 * end to end -- columns on orders, items and invoices, a rate on the invoice,
 * a note explaining the treatment -- and currently resolves to zero, honestly
 * labelled. Turning it on is: obtain registrations, set `TAX.enabled`, and
 * revisit `automatic_tax` on the session. The schema does not change.
 * ──────────────────────────────────────────────────────────────────────────
 */
export const TAX = {
  enabled: false,
  /** Basis points, i.e. 1300 = 13%. Unused while disabled. */
  rateBasisPoints: 0,
  /** Printed on the invoice so the treatment is stated, not implied. */
  noteKey: "noRegistration",
} as const;

/**
 * How long a quoted price is held.
 *
 * A quote carries a frozen price derived from a rate table and a ruleset that
 * both move. Holding it indefinitely means honouring arithmetic that may be a
 * year stale; holding it too briefly makes the product feel like a haggle.
 */
export const QUOTE_VALID_DAYS = 14;

/**
 * How long an unpaid checkout stays open before the order is treated as
 * abandoned. Stripe Checkout Sessions themselves expire after 24 hours.
 */
export const CHECKOUT_EXPIRY_HOURS = 24;

/** Payment terms printed on the invoice. Builds are paid up front. */
export const INVOICE_DUE_DAYS = 0;

/**
 * Document number series.
 *
 * Year-scoped and gapless. See `documentCounters` for why these do not come
 * from a Postgres sequence.
 */
export const DOCUMENT_SERIES = {
  order: { prefix: "ORD", padTo: 4 },
  invoice: { prefix: "INV", padTo: 4 },
  /** Quoted to the customer in every message about their build. */
  project: { prefix: "PRJ", padTo: 4 },
  /** A maintenance subscription, referenced on every renewal invoice. */
  subscription: { prefix: "SUB", padTo: 4 },
} as const;

export type DocumentScope = keyof typeof DOCUMENT_SERIES;

export function formatDocumentNumber(
  scope: DocumentScope,
  year: number,
  value: number,
): string {
  const { prefix, padTo } = DOCUMENT_SERIES[scope];
  return `${prefix}-${year}-${String(value).padStart(padTo, "0")}`;
}
