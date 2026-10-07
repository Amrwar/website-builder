import type { BuildType } from "./products";
import type { CapabilityKey } from "@/lib/scope";

/**
 * Business-in-a-Box: the shipped catalogue.
 *
 * Someone starting a business does not know they want `booking_scheduling`
 * and `admin_dashboard`; they know they are opening a barbershop. A blueprint
 * is the translation between the two -- an industry's usual answer to "what
 * do I need online", expressed in the platform's own vocabulary so the
 * existing engine can price it.
 *
 * ── What is data and what is not ──────────────────────────────────────────
 * Three layers, each defined once:
 *
 *  - **Features** are the units a customer sees and toggles: "Online
 *    ordering", "Staff dashboard". Each is defined as the capabilities it
 *    needs and the screens it adds. That is the whole of its commercial
 *    meaning -- a feature has no price of its own, for the same reason a
 *    module does not (`modules.ts`): a second price list would drift from the
 *    engine's the first time either moved.
 *  - **Blueprints** say which features an industry usually needs
 *    (recommended), sometimes wants (optional), and -- by omission -- does
 *    not need. Shipped here as version 0; an administrator's published
 *    version in the database replaces it, in the same overlay arrangement as
 *    the pricing catalogue.
 *  - **Categories** group blueprints for browsing.
 *
 * Names and descriptions are not here. Shipped copy lives in the translation
 * catalogues under `blueprints.*`; copy for a blueprint an administrator
 * created lives with its version, in all three languages.
 *
 * Features are code, not admin data, and that is deliberate: a feature's
 * capability mapping is what makes its price honest, and a mapping that
 * could be edited into `[]` would price as free.
 * ──────────────────────────────────────────────────────────────────────────
 */

/* -------------------------------------------------------------------------
 * Features
 * ---------------------------------------------------------------------- */

/** How the customer will think of it, for grouping on the screen. */
export const FEATURE_KINDS = ["page", "feature", "workflow"] as const;
export type FeatureKind = (typeof FEATURE_KINDS)[number];

/** Who uses it: the business's own customers, or the business itself. */
export const FEATURE_AUDIENCES = ["customer", "admin"] as const;
export type FeatureAudience = (typeof FEATURE_AUDIENCES)[number];

export interface BusinessFeature {
  id: string;
  kind: FeatureKind;
  audience: FeatureAudience;
  /**
   * The capabilities this needs. Empty only for a plain content page, whose
   * cost is carried entirely by `screens`.
   */
  provides: readonly CapabilityKey[];
  /**
   * Screens it adds to the build. Summed into the draft's estimated screen
   * count, which the scope engine charges for past each product's allowance
   * -- so a blueprint with twelve pages does not price like one with four.
   */
  screens: number;
}

export const BUSINESS_FEATURES = [
  /* --- Pages ---------------------------------------------------------- */
  { id: "home", kind: "page", audience: "customer", provides: [], screens: 1 },
  { id: "about", kind: "page", audience: "customer", provides: [], screens: 1 },
  { id: "services", kind: "page", audience: "customer", provides: [], screens: 1 },
  {
    id: "contact",
    kind: "page",
    audience: "customer",
    provides: ["contact_forms"],
    screens: 1,
  },
  { id: "gallery", kind: "page", audience: "customer", provides: [], screens: 1 },
  { id: "team", kind: "page", audience: "customer", provides: [], screens: 1 },
  { id: "faq", kind: "page", audience: "customer", provides: [], screens: 1 },
  {
    id: "menu",
    kind: "page",
    audience: "customer",
    provides: ["cms_editing"],
    screens: 1,
  },
  {
    id: "portfolio",
    kind: "page",
    audience: "customer",
    provides: ["cms_editing"],
    screens: 2,
  },
  {
    id: "listings",
    kind: "page",
    audience: "customer",
    provides: ["product_catalog"],
    screens: 2,
  },
  { id: "blog", kind: "page", audience: "customer", provides: ["blog"], screens: 2 },

  /* --- Customer-facing functionality ---------------------------------- */
  {
    id: "online_booking",
    kind: "feature",
    audience: "customer",
    provides: ["booking_scheduling"],
    screens: 2,
  },
  {
    id: "reservations",
    kind: "feature",
    audience: "customer",
    provides: ["booking_scheduling"],
    screens: 1,
  },
  {
    id: "online_ordering",
    kind: "feature",
    audience: "customer",
    provides: ["product_catalog", "order_management", "hosted_checkout"],
    screens: 3,
  },
  {
    id: "online_store",
    kind: "feature",
    audience: "customer",
    provides: ["product_catalog", "order_management", "hosted_checkout"],
    screens: 3,
  },
  {
    id: "payments",
    kind: "feature",
    audience: "customer",
    provides: ["hosted_checkout"],
    screens: 1,
  },
  {
    id: "memberships",
    kind: "feature",
    audience: "customer",
    provides: ["subscriptions", "user_accounts"],
    screens: 2,
  },
  {
    id: "customer_accounts",
    kind: "feature",
    audience: "customer",
    provides: ["user_accounts"],
    screens: 2,
  },
  {
    id: "client_portal",
    kind: "feature",
    audience: "customer",
    provides: ["user_accounts", "cms_editing"],
    screens: 3,
  },
  {
    id: "quote_requests",
    kind: "feature",
    audience: "customer",
    provides: ["contact_forms"],
    screens: 1,
  },
  /**
   * Reviews the business chooses to show, edited like any other content.
   * Not a review-collection system: that would need moderation and identity
   * the capability catalogue does not price, and selling it on this key
   * would be selling it below cost.
   */
  {
    id: "reviews",
    kind: "feature",
    audience: "customer",
    provides: ["cms_editing"],
    screens: 1,
  },
  {
    id: "multilingual",
    kind: "feature",
    audience: "customer",
    provides: ["multilingual"],
    screens: 0,
  },

  /* --- Administrative functionality ----------------------------------- */
  {
    id: "content_editing",
    kind: "feature",
    audience: "admin",
    provides: ["cms_editing"],
    screens: 0,
  },
  {
    id: "staff_dashboard",
    kind: "feature",
    audience: "admin",
    provides: ["admin_dashboard"],
    screens: 2,
  },
  {
    id: "staff_roles",
    kind: "feature",
    audience: "admin",
    provides: ["multi_role_access"],
    screens: 1,
  },
  {
    id: "inventory",
    kind: "feature",
    audience: "admin",
    provides: ["inventory"],
    screens: 2,
  },
  {
    id: "analytics",
    kind: "feature",
    audience: "admin",
    provides: ["reporting"],
    screens: 1,
  },
  {
    id: "integrations",
    kind: "feature",
    audience: "admin",
    provides: ["third_party_integration"],
    screens: 0,
  },
  {
    id: "data_import",
    kind: "feature",
    audience: "admin",
    provides: ["data_migration"],
    screens: 0,
  },

  /* --- Workflows ------------------------------------------------------ */
  {
    id: "order_fulfilment",
    kind: "workflow",
    audience: "admin",
    provides: ["order_management", "admin_dashboard"],
    screens: 1,
  },
  {
    id: "job_scheduling",
    kind: "workflow",
    audience: "admin",
    provides: ["booking_scheduling", "admin_dashboard"],
    screens: 1,
  },
  {
    id: "lead_pipeline",
    kind: "workflow",
    audience: "admin",
    provides: ["admin_dashboard", "reporting"],
    screens: 2,
  },
  /**
   * Routing crews between jobs. Custom tier in the capability catalogue, so
   * choosing it routes the whole build to a quotation -- which is the
   * correct answer, not a bug: it is the one item here nobody can promise
   * in five days.
   */
  {
    id: "dispatch",
    kind: "workflow",
    audience: "admin",
    provides: ["dispatch_logistics"],
    screens: 2,
  },
] as const satisfies readonly BusinessFeature[];

export type BusinessFeatureId = (typeof BUSINESS_FEATURES)[number]["id"];

export const FEATURE_IDS = BUSINESS_FEATURES.map((feature) => feature.id) as unknown as [
  BusinessFeatureId,
  ...BusinessFeatureId[],
];

const FEATURE_BY_ID = new Map<string, BusinessFeature>(
  BUSINESS_FEATURES.map((feature) => [feature.id, feature]),
);

export function getBusinessFeature(id: string): BusinessFeature | undefined {
  return FEATURE_BY_ID.get(id);
}

export function isBusinessFeatureId(value: unknown): value is BusinessFeatureId {
  return typeof value === "string" && FEATURE_BY_ID.has(value);
}

/* -------------------------------------------------------------------------
 * Goals
 * ---------------------------------------------------------------------- */

/**
 * What the customer says they want the business to do.
 *
 * Each goal names the features it argues for. The rule is deliberately
 * small and stated in the UI: a goal moves an optional feature up to
 * recommended, and surfaces a not-needed one as optional. It never adds
 * anything to the order by itself beyond what the customer can see and
 * remove.
 */
export interface BusinessGoal {
  id: string;
  promotes: readonly BusinessFeatureId[];
}

export const BUSINESS_GOALS = [
  { id: "get_found", promotes: ["about", "faq", "blog"] },
  { id: "take_bookings", promotes: ["online_booking", "reservations", "job_scheduling"] },
  { id: "sell_online", promotes: ["online_store", "online_ordering", "payments"] },
  { id: "take_payments", promotes: ["payments"] },
  { id: "keep_customers", promotes: ["customer_accounts", "memberships", "reviews"] },
  {
    id: "run_operations",
    promotes: [
      "staff_dashboard",
      "analytics",
      "inventory",
      "order_fulfilment",
      "lead_pipeline",
    ],
  },
  { id: "reach_languages", promotes: ["multilingual"] },
] as const satisfies readonly BusinessGoal[];

export type BusinessGoalId = (typeof BUSINESS_GOALS)[number]["id"];

export const GOAL_IDS = BUSINESS_GOALS.map((goal) => goal.id) as unknown as [
  BusinessGoalId,
  ...BusinessGoalId[],
];

/* -------------------------------------------------------------------------
 * Categories
 * ---------------------------------------------------------------------- */

export const SHIPPED_CATEGORIES = [
  "food_hospitality",
  "beauty_grooming",
  "health",
  "fitness",
  "home_services",
  "automotive",
  "professional_services",
  "property",
  "retail",
  "creative",
] as const;

/* -------------------------------------------------------------------------
 * Blueprints
 * ---------------------------------------------------------------------- */

export type Recommendation = "recommended" | "optional";

/** The level shown to a customer: absent from the blueprint means not needed. */
export type RecommendationLevel = Recommendation | "not_needed";

export interface ShippedBlueprint {
  key: string;
  categoryKey: (typeof SHIPPED_CATEGORIES)[number];
  buildType: BuildType;
  recommended: readonly BusinessFeatureId[];
  optional: readonly BusinessFeatureId[];
}

/**
 * Version 0 of every blueprint.
 *
 * The build type is the product the recommended set needs, not the cheapest
 * one: a restaurant taking orders runs a system with a staff side, and
 * pretending it is a brochure site would put the price in the wrong place.
 * The engine still decides the tier from what is actually selected.
 */
export const SHIPPED_BLUEPRINTS = [
  {
    key: "restaurant",
    categoryKey: "food_hospitality",
    buildType: "system",
    recommended: [
      "home",
      "about",
      "menu",
      "contact",
      "online_ordering",
      "reservations",
      "payments",
      "customer_accounts",
      "reviews",
      "staff_dashboard",
      "analytics",
    ],
    optional: [
      "gallery",
      "multilingual",
      "inventory",
      "order_fulfilment",
      "content_editing",
    ],
  },
  {
    key: "barber",
    categoryKey: "beauty_grooming",
    buildType: "website",
    recommended: ["home", "services", "gallery", "contact", "online_booking", "reviews"],
    optional: [
      "team",
      "payments",
      "customer_accounts",
      "memberships",
      "analytics",
      "multilingual",
      "content_editing",
    ],
  },
  {
    key: "salon",
    categoryKey: "beauty_grooming",
    buildType: "website",
    recommended: [
      "home",
      "services",
      "team",
      "gallery",
      "contact",
      "online_booking",
      "reviews",
    ],
    optional: [
      "payments",
      "memberships",
      "customer_accounts",
      "blog",
      "analytics",
      "multilingual",
    ],
  },
  {
    key: "dental_clinic",
    categoryKey: "health",
    buildType: "website",
    recommended: [
      "home",
      "about",
      "services",
      "team",
      "contact",
      "online_booking",
      "faq",
    ],
    optional: ["reviews", "payments", "multilingual", "blog", "analytics"],
  },
  {
    key: "gym",
    categoryKey: "fitness",
    buildType: "system",
    recommended: [
      "home",
      "services",
      "team",
      "contact",
      "memberships",
      "online_booking",
      "payments",
      "staff_dashboard",
    ],
    optional: ["analytics", "blog", "gallery", "multilingual", "staff_roles"],
  },
  {
    key: "cleaning_company",
    categoryKey: "home_services",
    buildType: "website",
    recommended: [
      "home",
      "services",
      "contact",
      "quote_requests",
      "online_booking",
      "reviews",
    ],
    optional: [
      "payments",
      "job_scheduling",
      "staff_dashboard",
      "analytics",
      "faq",
      "dispatch",
    ],
  },
  {
    key: "contractor",
    categoryKey: "home_services",
    buildType: "website",
    recommended: [
      "home",
      "about",
      "services",
      "portfolio",
      "contact",
      "quote_requests",
      "reviews",
    ],
    optional: [
      "lead_pipeline",
      "client_portal",
      "job_scheduling",
      "dispatch",
      "payments",
      "analytics",
      "blog",
    ],
  },
  {
    key: "auto_repair",
    categoryKey: "automotive",
    buildType: "website",
    recommended: [
      "home",
      "services",
      "about",
      "contact",
      "online_booking",
      "quote_requests",
      "reviews",
    ],
    optional: [
      "payments",
      "job_scheduling",
      "customer_accounts",
      "staff_dashboard",
      "analytics",
    ],
  },
  {
    key: "consultant",
    categoryKey: "professional_services",
    buildType: "website",
    recommended: ["home", "about", "services", "contact", "online_booking", "blog"],
    optional: [
      "payments",
      "client_portal",
      "lead_pipeline",
      "faq",
      "multilingual",
      "analytics",
    ],
  },
  {
    key: "freelancer",
    categoryKey: "professional_services",
    buildType: "website",
    recommended: ["home", "about", "portfolio", "services", "contact"],
    optional: ["online_booking", "payments", "blog", "client_portal"],
  },
  {
    key: "real_estate",
    categoryKey: "property",
    buildType: "system",
    recommended: ["home", "about", "listings", "team", "contact", "quote_requests"],
    optional: [
      "lead_pipeline",
      "staff_roles",
      "customer_accounts",
      "blog",
      "multilingual",
      "analytics",
      "integrations",
    ],
  },
  {
    key: "retail_store",
    categoryKey: "retail",
    buildType: "system",
    recommended: [
      "home",
      "about",
      "contact",
      "online_store",
      "payments",
      "inventory",
      "staff_dashboard",
      "analytics",
    ],
    optional: [
      "customer_accounts",
      "reviews",
      "blog",
      "multilingual",
      "order_fulfilment",
      "data_import",
    ],
  },
  {
    key: "photographer",
    categoryKey: "creative",
    buildType: "website",
    recommended: ["home", "about", "portfolio", "services", "contact", "online_booking"],
    optional: ["client_portal", "payments", "reviews", "blog"],
  },
] as const satisfies readonly ShippedBlueprint[];

export type ShippedBlueprintKey = (typeof SHIPPED_BLUEPRINTS)[number]["key"];

export function isShippedBlueprintKey(value: string): value is ShippedBlueprintKey {
  return SHIPPED_BLUEPRINTS.some((blueprint) => blueprint.key === value);
}

export function isShippedCategoryKey(
  value: string,
): value is (typeof SHIPPED_CATEGORIES)[number] {
  return (SHIPPED_CATEGORIES as readonly string[]).includes(value);
}

/** Keys an administrator may give a new blueprint or category. */
export const BLUEPRINT_KEY_PATTERN = /^[a-z][a-z0-9_]{1,47}$/;
