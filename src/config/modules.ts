import type { BuildType } from "./products";
import type { CapabilityKey } from "@/lib/scope";

/**
 * Reusable modules.
 *
 * A module is a named bundle of capability the platform can build repeatedly:
 * booking, CRM, inventory, loyalty. The point of declaring them is that the
 * second customer who wants booking should get the thing the first one got,
 * rather than a fresh interpretation of the word.
 *
 * ── What this file is and is not ──────────────────────────────────────────
 * It is a registry, not an implementation. Nothing here builds anything. A
 * module's entry says what it is made of, which products can carry it, and
 * whether it exists yet. Building one means writing it and flipping `status`,
 * not inventing a new place for it to be described.
 *
 * ── Why modules are made of capabilities ──────────────────────────────────
 * The scope engine already prices `CapabilityKey`s, decides which tier they
 * force, and refuses the ones a product cannot carry. A module that invented
 * its own pricing would be a second answer to a question the engine already
 * answers, and the two would drift the first time a price moved.
 *
 * So a module is defined as the capabilities it provides, and its price,
 * complexity and minimum tier all fall out of the engine. That is the whole
 * reason this is a thin file: the hard part was already built.
 *
 * ── On `status` ───────────────────────────────────────────────────────────
 * `available` means the capability keys it names are genuinely deliverable
 * today. `planned` means the module is declared so it has one agreed shape,
 * and is not orderable. Nothing reads `planned` modules into a customer-facing
 * surface -- the same rule as the admin navigation, for the same reason.
 * ──────────────────────────────────────────────────────────────────────────
 */

export type ModuleStatus = "available" | "planned";

export interface PlatformModule {
  id: string;
  /**
   * The capabilities this module delivers.
   *
   * Every key must exist in `CAPABILITIES`; the test enforces it. A module
   * naming a capability that does not exist would price as though it were
   * free, which is the expensive direction to be wrong in.
   */
  provides: readonly CapabilityKey[];
  /**
   * Which products can carry it. A module is not universal: inventory in a
   * brochure site is not a thing anybody wants.
   */
  appliesTo: readonly BuildType[];
  status: ModuleStatus;
}

export const PLATFORM_MODULES = [
  {
    id: "forms",
    provides: ["contact_forms"],
    appliesTo: ["website", "system"],
    status: "available",
  },
  {
    id: "content",
    provides: ["cms_editing", "blog"],
    appliesTo: ["website", "system"],
    status: "available",
  },
  {
    id: "accounts",
    provides: ["user_accounts", "multi_role_access"],
    appliesTo: ["system", "mobileApp"],
    status: "available",
  },
  {
    id: "payments",
    provides: ["hosted_checkout"],
    appliesTo: ["website", "system", "mobileApp"],
    status: "available",
  },
  {
    id: "commerce",
    provides: ["product_catalog", "order_management"],
    appliesTo: ["website", "system"],
    status: "available",
  },
  {
    id: "subscriptions",
    provides: ["subscriptions"],
    appliesTo: ["website", "system", "mobileApp"],
    status: "available",
  },
  {
    id: "booking",
    provides: ["booking_scheduling"],
    appliesTo: ["website", "system", "mobileApp"],
    status: "available",
  },
  {
    id: "inventory",
    provides: ["inventory"],
    appliesTo: ["system"],
    status: "available",
  },
  {
    id: "crm",
    provides: ["admin_dashboard", "reporting"],
    appliesTo: ["system"],
    status: "available",
  },
  {
    id: "analytics",
    provides: ["reporting"],
    appliesTo: ["website", "system", "mobileApp"],
    status: "available",
  },
  {
    id: "messaging",
    provides: ["chat_messaging", "push_notifications"],
    appliesTo: ["system", "mobileApp"],
    status: "available",
  },
  /**
   * Declared, not built. Loyalty has no capability of its own in the scope
   * catalogue yet, so it has nothing honest to price against -- which is
   * exactly why it is `planned` rather than given a borrowed key.
   */
  {
    id: "loyalty",
    provides: [],
    appliesTo: ["website", "system", "mobileApp"],
    status: "planned",
  },
  {
    id: "reviews",
    provides: [],
    appliesTo: ["website", "system"],
    status: "planned",
  },
] as const satisfies readonly PlatformModule[];

export type ModuleId = (typeof PLATFORM_MODULES)[number]["id"];

const BY_ID = new Map<string, PlatformModule>(PLATFORM_MODULES.map((m) => [m.id, m]));

export function getModule(id: string): PlatformModule | undefined {
  return BY_ID.get(id);
}

/** Modules a given product can carry, excluding ones that do not exist yet. */
export function modulesFor(buildType: BuildType): readonly PlatformModule[] {
  return PLATFORM_MODULES.filter(
    (entry) =>
      entry.status === "available" &&
      // Widened: `as const` narrows each module's list to its own literals, so
      // the element type is not `BuildType` but whichever members that module
      // happens to name.
      (entry.appliesTo as readonly BuildType[]).includes(buildType),
  );
}

/**
 * The capabilities a set of modules adds up to.
 *
 * Deduplicated, because two modules may legitimately provide the same
 * capability -- CRM and analytics both want reporting -- and charging for it
 * twice because two boxes were ticked would be indefensible.
 */
export function capabilitiesForModules(ids: readonly string[]): readonly CapabilityKey[] {
  const keys = new Set<CapabilityKey>();
  for (const id of ids) {
    for (const key of getModule(id)?.provides ?? []) keys.add(key);
  }
  return [...keys];
}
