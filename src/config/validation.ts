/**
 * Test my business idea: the fixed parts.
 *
 * A validation is a real, public landing page for an idea that does not
 * exist yet, with a way for interested people to say so, and a count of what
 * happened. It measures how people responded to one page. It does not prove
 * there is a market, and nothing in the product may say that it does -- the
 * copy says "early validation signals" and means it.
 *
 * Everything here is deterministic. There is no generated copy and no
 * "score": the page shows the customer's own words, and the results show
 * counts and ratios computed from events, with the sample size beside them.
 */

/** Whether the offer exists yet. Decides the default way of capturing interest. */
export const AVAILABILITIES = ["now", "soon"] as const;
export type Availability = (typeof AVAILABILITIES)[number];

/**
 * How interest is captured.
 *
 * `inquiry` asks a question about something that can be bought now;
 * `waitlist` collects an email for something that cannot yet. Offering a
 * waitlist for a thing on sale today, or an inquiry form for a thing that
 * does not exist, would measure the wrong behaviour -- hence the default
 * follows availability, and the customer can still override it.
 */
export const CAPTURE_MODES = ["inquiry", "waitlist"] as const;
export type CaptureMode = (typeof CAPTURE_MODES)[number];

export function defaultCaptureMode(availability: Availability): CaptureMode {
  return availability === "soon" ? "waitlist" : "inquiry";
}

/** How a price is shown. `none` tests interest before price. */
export const PRICE_MODELS = ["none", "one_time", "monthly", "from"] as const;
export type PriceModel = (typeof PRICE_MODELS)[number];

/** Live accepts responses; paused hides the form; closed is final. */
export const VALIDATION_STATUSES = ["live", "paused", "closed"] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

/** What the page records. Facts about behaviour, never inferred states. */
export const VALIDATION_EVENT_KINDS = ["view", "cta_click", "inquiry", "signup"] as const;
export type ValidationEventKind = (typeof VALIDATION_EVENT_KINDS)[number];

export const VALIDATION_LIMITS = {
  /**
   * Live tests per account. A test is a public page on our domain; a cap
   * keeps one account from turning the product into free hosting.
   */
  maxLive: 3,
  maxBenefits: 3,
  name: 80,
  oneLiner: 120,
  description: 1000,
  minDescription: 20,
  customer: 120,
  problem: 300,
  headline: 80,
  details: 600,
  benefit: 80,
  /** Major units. A test is not a checkout; this only bounds the display. */
  maxPrice: 1_000_000,
  leadName: 80,
  leadMessage: 1000,
} as const;

/**
 * Below this many unique visitors the results say it is too early to read
 * anything into the ratios. One sign-up from three visitors is 33% and means
 * nothing; the threshold is where a ratio starts to be worth looking at, not
 * a guarantee that it is meaningful.
 */
export const MIN_VISITORS_FOR_READING = 100;

/** Days shown in the results' daily breakdown. */
export const RESULTS_DAYS = 14;
