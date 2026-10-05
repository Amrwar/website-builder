/**
 * Brand constants.
 *
 * Kept out of the translation catalogues on purpose: a product name is not
 * translated, and holding it here means renaming the company is a one-line
 * change rather than an edit across every locale file.
 *
 * NOTE: `name` is a working placeholder pending the real company name.
 */
export const BRAND = {
  name: "Buildline",
  /** Used in the `<title>` template and structured data. */
  legalName: "Buildline",
  /** The promise that leads the marketing site. */
  tagline: "Your idea. Built this week.",
  domain: "buildline.dev",
  supportEmail: "hello@buildline.dev",
} as const;

/**
 * Delivery guarantees, in days. These are commercial commitments, so they are
 * defined once and read by the marketing copy, the configurator, the scope
 * engine and the countdown timer alike -- never retyped per surface.
 */
export const DELIVERY_DAYS = {
  website: 5,
  system: 5,
  mobileApp: 14,
} as const;

/**
 * Refund terms applied when a guaranteed development deadline is missed.
 * `cancel` returns everything; `continue` keeps the build running.
 */
export const MISSED_DEADLINE_REFUND = {
  cancelPercent: 100,
  continuePercent: 30,
} as const;
