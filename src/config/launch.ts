import type { ChecklistGroup } from "@/db/schema/enums";

/**
 * The launch checklist, as shipped.
 *
 * Phase 11 required that the checklist not be hard-coded into the UI, and it
 * is not: `launch_checklist_items` decides what a launch requires, and the
 * Launch Centre renders whatever is in it. This file is the seed and the
 * fallback for that table, exactly as `config/products` is for the pricing
 * catalogue -- an empty table means "use what shipped", so a launch works
 * before anybody has edited the list.
 *
 * Items are deliberately phrased as things that are **true**, not as tasks.
 * "SSL certificate issued" can be checked; "set up SSL" cannot be told apart
 * from "someone meant to".
 */

export interface LaunchChecklistDefinition {
  key: string;
  group: ChecklistGroup;
  /** Key under `workspace.launch.items.*`. */
  translationKey: string;
  /** Product types this applies to. Empty means all of them. */
  appliesTo: readonly string[];
  /** A launch is blocked until every required item is resolved. */
  isRequired: boolean;
  /** False for items only staff should see. */
  customerVisible: boolean;
}

export const LAUNCH_CHECKLIST = [
  /* --- What the customer owes --------------------------------------- */
  {
    key: "content_final",
    group: "customer",
    translationKey: "contentFinal",
    appliesTo: [],
    isRequired: true,
    customerVisible: true,
  },
  {
    key: "preview_approved",
    group: "customer",
    translationKey: "previewApproved",
    appliesTo: [],
    isRequired: true,
    customerVisible: true,
  },
  {
    key: "domain_chosen",
    group: "customer",
    translationKey: "domainChosen",
    appliesTo: ["build", "business_product"],
    isRequired: true,
    customerVisible: true,
  },

  /* --- Our technical readiness --------------------------------------- */
  {
    key: "production_deployed",
    group: "technical",
    translationKey: "productionDeployed",
    appliesTo: ["build", "business_product"],
    isRequired: true,
    customerVisible: true,
  },
  {
    key: "dns_configured",
    group: "technical",
    translationKey: "dnsConfigured",
    appliesTo: ["build", "business_product"],
    isRequired: true,
    customerVisible: true,
  },
  {
    key: "ssl_issued",
    group: "technical",
    translationKey: "sslIssued",
    appliesTo: ["build", "business_product"],
    isRequired: true,
    customerVisible: true,
  },
  {
    key: "forms_tested",
    group: "technical",
    translationKey: "formsTested",
    appliesTo: [],
    isRequired: true,
    customerVisible: true,
  },
  {
    key: "mobile_checked",
    group: "technical",
    translationKey: "mobileChecked",
    appliesTo: ["build", "business_product"],
    isRequired: true,
    customerVisible: false,
  },
  {
    key: "backups_running",
    group: "technical",
    translationKey: "backupsRunning",
    appliesTo: ["build", "business_product"],
    isRequired: false,
    customerVisible: false,
  },

  /* --- Before it is public -------------------------------------------- */
  {
    key: "analytics_installed",
    group: "compliance",
    translationKey: "analyticsInstalled",
    appliesTo: [],
    isRequired: false,
    customerVisible: true,
  },
  {
    key: "search_indexable",
    group: "compliance",
    translationKey: "searchIndexable",
    appliesTo: ["build", "business_product"],
    isRequired: true,
    customerVisible: false,
  },
  {
    key: "handover_sent",
    group: "compliance",
    translationKey: "handoverSent",
    appliesTo: [],
    isRequired: true,
    customerVisible: true,
  },
] as const satisfies readonly LaunchChecklistDefinition[];

export type LaunchChecklistKey = (typeof LAUNCH_CHECKLIST)[number]["key"];

/** The items that apply to one product type, in display order. */
export function checklistFor(
  productType: string,
  items: readonly LaunchChecklistDefinition[] = LAUNCH_CHECKLIST,
): readonly LaunchChecklistDefinition[] {
  return items.filter(
    (item) => item.appliesTo.length === 0 || item.appliesTo.includes(productType),
  );
}

/**
 * Hosting.
 *
 * Named rather than inferred so a provider change is a value here and a
 * migration of existing rows, not a search through string literals.
 */
export const HOSTING_PROVIDER = "vercel";

/**
 * How long a domain's certificate may have left before it is worth saying so.
 *
 * Thirty days is the point at which a renewal that has not happened is a
 * problem rather than a future event.
 */
export const SSL_EXPIRY_WARNING_DAYS = 30;
