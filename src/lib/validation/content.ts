import { z } from "zod";

import { BLUEPRINT_KEY_PATTERN } from "@/config/business";
import { LOCALES, type Locale } from "@/config/locales";
import {
  AVAILABILITIES,
  CAPTURE_MODES,
  MIN_VISITORS_FOR_READING,
  PRICE_MODELS,
  VALIDATION_LIMITS as L,
} from "@/config/validation";
import { SUPPORTED_CURRENCIES } from "@/lib/pricing/money";

/**
 * A validation page's content, and what its numbers amount to.
 *
 * Pure, and shared: the wizard validates each step with it, the server
 * re-parses the whole thing before publishing, and the public page renders
 * exactly what passed.
 */

/* -------------------------------------------------------------------------
 * Content
 * ---------------------------------------------------------------------- */

/**
 * No links. A validation page is a stranger's words on our domain, and a
 * link is what turns a landing page into a phishing page. The customer's
 * own channel for following up is the leads they collect, not an outbound
 * link.
 */
const LINK = /(https?:\/\/|www\.)/i;

function text(max: number, min = 0) {
  return z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((value) => !LINK.test(value), { message: "links" });
}

const CURRENCY_CODES = SUPPORTED_CURRENCIES as unknown as [string, ...string[]];

export const priceSchema = z
  .object({
    model: z.enum(PRICE_MODELS),
    /** Major units as typed; stored as minor units by the server. */
    amount: z.number().min(0).max(L.maxPrice).nullable(),
    currency: z.enum(CURRENCY_CODES),
  })
  .refine(
    (price) => price.model === "none" || (price.amount !== null && price.amount > 0),
    {
      message: "price",
      path: ["amount"],
    },
  );

export const validationContentSchema = z.object({
  /** Bumped when the shape changes, so a stale saved draft is discarded. */
  version: z.literal(1),
  locale: z.enum(LOCALES),

  businessName: text(L.name, 1),
  oneLiner: text(L.oneLiner, 1),
  /** For later: the Business-in-a-Box blueprint this idea is closest to. */
  blueprintKey: z.string().regex(BLUEPRINT_KEY_PATTERN).nullable(),

  description: text(L.description, L.minDescription),

  targetCustomer: text(L.customer, 1),
  problem: text(L.problem),

  headline: text(L.headline, 1),
  details: text(L.details),
  benefits: z.array(text(L.benefit, 1)).max(L.maxBenefits),
  availability: z.enum(AVAILABILITIES),

  price: priceSchema,

  captureMode: z.enum(CAPTURE_MODES),
});

export type ValidationContent = z.infer<typeof validationContentSchema>;

export function emptyContent(locale: Locale): ValidationContent {
  return {
    version: 1,
    locale,
    businessName: "",
    oneLiner: "",
    blueprintKey: null,
    description: "",
    targetCustomer: "",
    problem: "",
    headline: "",
    details: "",
    benefits: [],
    availability: "now",
    price: { model: "none", amount: null, currency: "CAD" },
    captureMode: "inquiry",
  };
}

/* -------------------------------------------------------------------------
 * The wizard's steps
 * ---------------------------------------------------------------------- */

export const VALIDATION_STEPS = [
  "idea",
  "description",
  "customer",
  "offer",
  "pricing",
  "landing",
  "capture",
  "publish",
] as const;
export type ValidationStep = (typeof VALIDATION_STEPS)[number];

/** Which fields each input step owns, so a step reports only its own problems. */
const STEP_FIELDS: Partial<Record<ValidationStep, readonly (keyof ValidationContent)[]>> =
  {
    idea: ["businessName", "oneLiner", "blueprintKey"],
    description: ["description"],
    customer: ["targetCustomer", "problem"],
    offer: ["headline", "details", "benefits", "availability"],
    pricing: ["price"],
    capture: ["captureMode"],
  };

/**
 * What stops a step, as a translation key suffix, or null when it is fine.
 *
 * `links` is its own answer because it is the one a customer will not
 * guess: their text was long enough, it simply contained an address.
 */
export type StepIssue =
  | "needName"
  | "needOneLiner"
  | "describeMore"
  | "needCustomer"
  | "needHeadline"
  | "needPrice"
  | "links"
  | "tooLong"
  | "completeEarlierSteps"
  | null;

const REQUIRED_ISSUE: Partial<Record<keyof ValidationContent, StepIssue>> = {
  businessName: "needName",
  oneLiner: "needOneLiner",
  description: "describeMore",
  targetCustomer: "needCustomer",
  headline: "needHeadline",
  price: "needPrice",
};

export function validateStep(
  step: ValidationStep,
  content: ValidationContent,
): StepIssue {
  const fields = STEP_FIELDS[step];
  if (!fields) {
    // Landing, publish: reachable once every input step is satisfied.
    return firstIncompleteStep(content) ? "completeEarlierSteps" : null;
  }
  const result = validationContentSchema.safeParse(content);
  if (result.success) return null;

  const issues = result.error.issues.filter((issue) =>
    fields.includes(issue.path[0] as keyof ValidationContent),
  );
  if (issues.length === 0) return null;
  if (issues.some((issue) => issue.message === "links")) return "links";
  const first = issues[0]!;
  const field = first.path[0] as keyof ValidationContent;
  if (first.code === "too_big") return "tooLong";
  return REQUIRED_ISSUE[field] ?? "tooLong";
}

export function firstIncompleteStep(content: ValidationContent): ValidationStep | null {
  for (const step of VALIDATION_STEPS) {
    if (!STEP_FIELDS[step]) continue;
    if (validateStep(step, content)) return step;
  }
  return null;
}

/* -------------------------------------------------------------------------
 * Signals
 * ---------------------------------------------------------------------- */

export interface ValidationCounts {
  /** Distinct visitors (salted, daily). Equal to views when unsalted. */
  visitors: number;
  views: number;
  ctaClicks: number;
  inquiries: number;
  signups: number;
}

export interface ValidationSignals extends ValidationCounts {
  leads: number;
  /** Leads per unique visitor, 0–1, or null with no visitors. */
  conversionRate: number | null;
  /** CTA clicks per unique visitor, 0–1, or null with no visitors. */
  clickThroughRate: number | null;
  /** Whether there is enough traffic for the ratios to be worth reading. */
  reading: "too_early" | "readable";
}

function ratio(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  // Capped: a visitor can submit more than once, and "120% converted" is a
  // statement about the arithmetic, not about the idea.
  return Math.min(part / whole, 1);
}

export function computeSignals(counts: ValidationCounts): ValidationSignals {
  const leads = counts.inquiries + counts.signups;
  return {
    ...counts,
    leads,
    conversionRate: ratio(leads, counts.visitors),
    clickThroughRate: ratio(counts.ctaClicks, counts.visitors),
    reading: counts.visitors >= MIN_VISITORS_FOR_READING ? "readable" : "too_early",
  };
}

/* -------------------------------------------------------------------------
 * Into Business-in-a-Box
 * ---------------------------------------------------------------------- */

export interface StartPrefill {
  blueprintKey: string | null;
  businessName: string;
  targetCustomers: string;
  offering: string;
}

/**
 * What a tested idea carries into "Start my business".
 *
 * The customer's own words, moved -- not rewritten. The offering is the
 * description, since that is the field Business-in-a-Box asks the same
 * question with, and it has already met the same minimum length.
 */
export function prefillFromValidation(
  content: Pick<
    ValidationContent,
    "blueprintKey" | "businessName" | "targetCustomer" | "description"
  >,
): StartPrefill {
  return {
    blueprintKey: content.blueprintKey,
    businessName: content.businessName.slice(0, 120),
    targetCustomers: content.targetCustomer.slice(0, 120),
    offering: content.description,
  };
}
