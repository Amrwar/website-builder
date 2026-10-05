import type { Capability, CapabilityCategory } from "./types";

/**
 * Capability registry.
 *
 * The vocabulary the scope engine reasons in. Each entry carries two separate
 * levers:
 *
 *   points       relative effort, which accumulates across a brief
 *   minimumTier  a floor this capability cannot be delivered below
 *
 * Both are needed. Points alone would let a brief with one genuinely hard
 * feature and little else qualify for the entry tier; a floor alone would miss
 * briefs that are heavy through sheer accumulation of ordinary work.
 */

/**
 * `satisfies` keeps each `labelKey` a literal, so a translation lookup built
 * from it stays checkable against the catalogue.
 */
export const CAPABILITY_CATEGORIES = [
  { id: "content", labelKey: "content" },
  { id: "identity", labelKey: "identity" },
  { id: "commerce", labelKey: "commerce" },
  { id: "realtime", labelKey: "realtime" },
  { id: "operations", labelKey: "operations" },
  { id: "integration", labelKey: "integration" },
  { id: "platform", labelKey: "platform" },
] as const satisfies readonly CapabilityCategory[];

export const CAPABILITIES = [
  // --- Content -----------------------------------------------------------
  { key: "cms_editing", categoryId: "content", points: 2, minimumTier: "essential" },
  { key: "blog", categoryId: "content", points: 2, minimumTier: "essential" },
  { key: "multilingual", categoryId: "content", points: 3, minimumTier: "essential" },
  { key: "contact_forms", categoryId: "content", points: 1, minimumTier: "essential" },

  // --- Identity ----------------------------------------------------------
  /** A single kind of logged-in user. Still an entry-tier build. */
  { key: "user_accounts", categoryId: "identity", points: 4, minimumTier: "essential" },
  /**
   * Several user types with genuinely different permissions. This is the
   * single most reliable signal that a brief has outgrown a 5-day build:
   * every additional role multiplies screens, rules and test surface.
   */
  {
    key: "multi_role_access",
    categoryId: "identity",
    points: 10,
    minimumTier: "advanced",
  },
  {
    key: "organisation_accounts",
    categoryId: "identity",
    points: 12,
    minimumTier: "advanced",
    implies: ["multi_role_access"],
  },

  // --- Commerce ----------------------------------------------------------
  /** Payment via a hosted provider page. Deliberately entry tier. */
  {
    key: "hosted_checkout",
    categoryId: "commerce",
    points: 4,
    minimumTier: "essential",
  },
  { key: "product_catalog", categoryId: "commerce", points: 6, minimumTier: "extended" },
  { key: "subscriptions", categoryId: "commerce", points: 8, minimumTier: "extended" },
  {
    key: "booking_scheduling",
    categoryId: "commerce",
    points: 8,
    minimumTier: "extended",
  },
  /**
   * Money split between several parties. Carries regulatory and onboarding
   * work that cannot be compressed, so it is never a published-price build.
   */
  {
    key: "marketplace_payouts",
    categoryId: "commerce",
    points: 18,
    minimumTier: "custom",
    implies: ["multi_role_access"],
  },

  // --- Realtime ----------------------------------------------------------
  {
    key: "push_notifications",
    categoryId: "realtime",
    points: 6,
    minimumTier: "extended",
  },
  { key: "live_updates", categoryId: "realtime", points: 10, minimumTier: "advanced" },
  { key: "chat_messaging", categoryId: "realtime", points: 10, minimumTier: "advanced" },
  /**
   * Live location on a map, updating continuously. Infrastructure, battery
   * and accuracy work in its own right.
   */
  {
    key: "realtime_location_tracking",
    categoryId: "realtime",
    points: 16,
    minimumTier: "custom",
    implies: ["live_updates"],
  },

  // --- Operations --------------------------------------------------------
  {
    key: "admin_dashboard",
    categoryId: "operations",
    points: 6,
    minimumTier: "extended",
  },
  {
    key: "order_management",
    categoryId: "operations",
    points: 8,
    minimumTier: "extended",
  },
  { key: "inventory", categoryId: "operations", points: 8, minimumTier: "extended" },
  { key: "reporting", categoryId: "operations", points: 6, minimumTier: "extended" },
  /**
   * Assigning work to people in the field. Operational logic that has to be
   * designed around a real business, not configured.
   */
  {
    key: "dispatch_logistics",
    categoryId: "operations",
    points: 16,
    minimumTier: "custom",
    implies: ["multi_role_access"],
  },

  // --- Integration -------------------------------------------------------
  {
    key: "third_party_integration",
    categoryId: "integration",
    points: 10,
    minimumTier: "advanced",
  },
  {
    key: "data_migration",
    categoryId: "integration",
    points: 8,
    minimumTier: "extended",
  },
  {
    key: "public_api",
    categoryId: "integration",
    points: 12,
    minimumTier: "advanced",
  },

  // --- Platform (mobile) -------------------------------------------------
  {
    key: "native_device_features",
    categoryId: "platform",
    points: 10,
    minimumTier: "advanced",
    appliesTo: ["mobileApp"],
  },
  {
    key: "offline_sync",
    categoryId: "platform",
    points: 14,
    minimumTier: "custom",
    appliesTo: ["mobileApp"],
  },
] as const satisfies readonly Capability[];

export type CapabilityKey = (typeof CAPABILITIES)[number]["key"];

const BY_KEY = new Map<string, Capability>(CAPABILITIES.map((c) => [c.key, c]));

export function getCapability(key: string): Capability | undefined {
  return BY_KEY.get(key);
}

export function isCapabilityKey(key: string): key is CapabilityKey {
  return BY_KEY.has(key);
}

/** One registry entry, with its literal key preserved. */
export type RegisteredCapability = (typeof CAPABILITIES)[number];

/** Capabilities meaningful for a given build type. */
export function capabilitiesFor(buildType: string): readonly RegisteredCapability[] {
  return CAPABILITIES.filter(
    (c) => !("appliesTo" in c) || (c.appliesTo as readonly string[]).includes(buildType),
  );
}
