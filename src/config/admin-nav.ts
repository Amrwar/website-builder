import type { Permission, UserRole } from "./roles";
import { roleHasPermission } from "./roles";

/**
 * The admin console's information architecture.
 *
 * One declaration of every section, what it requires, and whether it is
 * actually built. Navigation, page guards and the "what can this role see"
 * tests all read from here, so they cannot disagree with each other.
 *
 * ── On `status` ───────────────────────────────────────────────────────────
 * Several sections in the brief describe data the platform does not yet hold:
 * there are no domains, no hosting records, no partners, no CMS. Those are
 * declared here with `status: "planned"` and the phase they arrive in, and
 * they render an honest "not built yet" page rather than an empty table that
 * implies the feature exists and has no data. The difference matters -- an
 * empty table says "no customers have referred anyone"; a planned page says
 * "we have not built referrals".
 * ──────────────────────────────────────────────────────────────────────────
 */

export type AdminSectionStatus = "live" | "planned";

export interface AdminSection {
  id: string;
  /** Path under /admin. Empty string is the dashboard itself. */
  path: string;
  /** Every permission listed must be held. */
  requires: readonly Permission[];
  status: AdminSectionStatus;
  /** For planned sections, the phase that delivers them. */
  plannedFor?: number;
  group: AdminGroup;
}

export const ADMIN_GROUPS = ["operate", "commerce", "people", "platform"] as const;
export type AdminGroup = (typeof ADMIN_GROUPS)[number];

export const ADMIN_SECTIONS = [
  /* --- Operate: the production floor ---------------------------------- */
  {
    id: "dashboard",
    path: "",
    requires: ["admin:access"],
    status: "live",
    group: "operate",
  },
  {
    id: "queue",
    path: "/queue",
    requires: ["project:read:all"],
    status: "live",
    group: "operate",
  },
  {
    id: "projects",
    path: "/projects",
    requires: ["project:read:all"],
    status: "live",
    group: "operate",
  },
  {
    id: "approvals",
    path: "/approvals",
    requires: ["project:read:all"],
    status: "live",
    group: "operate",
  },
  {
    id: "changes",
    path: "/changes",
    requires: ["project:read:all"],
    status: "live",
    group: "operate",
  },
  {
    id: "deployments",
    path: "/deployments",
    requires: ["project:read:all"],
    status: "live",
    group: "operate",
  },
  {
    id: "files",
    path: "/files",
    requires: ["project:read:all"],
    status: "live",
    group: "operate",
  },
  {
    id: "messages",
    path: "/messages",
    requires: ["support:respond"],
    status: "live",
    group: "operate",
  },
  {
    id: "scope",
    path: "/scope",
    requires: ["project:read:all"],
    status: "live",
    group: "operate",
  },

  /* --- Commerce --------------------------------------------------------- */
  {
    id: "payments",
    path: "/payments",
    requires: ["finance:read"],
    status: "live",
    group: "commerce",
  },
  {
    id: "invoices",
    path: "/invoices",
    requires: ["finance:read"],
    status: "live",
    group: "commerce",
  },
  {
    id: "refunds",
    path: "/refunds",
    requires: ["billing:manage"],
    status: "live",
    group: "commerce",
  },
  {
    id: "pricing",
    path: "/pricing",
    requires: ["finance:read"],
    status: "live",
    group: "commerce",
  },
  {
    id: "analytics",
    path: "/analytics",
    requires: ["analytics:read"],
    status: "live",
    group: "commerce",
  },

  /* --- People ----------------------------------------------------------- */
  {
    id: "customers",
    path: "/customers",
    requires: ["customer:read"],
    status: "live",
    group: "people",
  },
  {
    id: "team",
    path: "/team",
    requires: ["user:manage"],
    status: "live",
    group: "people",
  },
  {
    id: "organizations",
    path: "/organizations",
    requires: ["customer:read"],
    status: "planned",
    plannedFor: 27,
    group: "people",
  },
  {
    id: "referrals",
    path: "/referrals",
    requires: ["analytics:read"],
    status: "planned",
    plannedFor: 12,
    group: "people",
  },
  {
    id: "partners",
    path: "/partners",
    requires: ["analytics:read"],
    status: "planned",
    plannedFor: 12,
    group: "people",
  },
  {
    id: "reviews",
    path: "/reviews",
    requires: ["customer:read"],
    status: "planned",
    plannedFor: 11,
    group: "people",
  },

  /* --- Platform --------------------------------------------------------- */
  {
    id: "audit",
    path: "/audit",
    requires: ["audit:read"],
    status: "live",
    group: "platform",
  },
  {
    id: "settings",
    path: "/settings",
    requires: ["settings:manage"],
    status: "live",
    group: "platform",
  },
  {
    id: "domains",
    path: "/domains",
    requires: ["project:manage"],
    status: "live",
    group: "platform",
  },
  {
    id: "hosting",
    path: "/hosting",
    requires: ["project:manage"],
    status: "live",
    group: "platform",
  },
  {
    id: "content",
    path: "/content",
    requires: ["settings:manage"],
    status: "planned",
    plannedFor: 12,
    group: "platform",
  },
  {
    id: "notifications",
    path: "/notifications",
    requires: ["settings:manage"],
    status: "planned",
    plannedFor: 12,
    group: "platform",
  },
] as const satisfies readonly AdminSection[];

export type AdminSectionId = (typeof ADMIN_SECTIONS)[number]["id"];

export function adminSection(id: string): AdminSection | undefined {
  return ADMIN_SECTIONS.find((section) => section.id === id);
}

/**
 * Whether a role may reach a section.
 *
 * Every listed permission must be held, not any. A section requiring both
 * `finance:read` and something else should be unreachable to someone holding
 * one of them, and "any" semantics would quietly widen access as the matrix
 * grows.
 */
export function canSeeSection(role: UserRole, section: AdminSection): boolean {
  return section.requires.every((permission) => roleHasPermission(role, permission));
}

/** The sections a role may see, in declaration order. */
export function sectionsFor(role: UserRole): AdminSection[] {
  return ADMIN_SECTIONS.filter((section) => canSeeSection(role, section));
}

/** The sections a role may see, grouped for the sidebar. */
export function groupedSectionsFor(
  role: UserRole,
): { group: AdminGroup; sections: AdminSection[] }[] {
  const visible = sectionsFor(role);
  return ADMIN_GROUPS.map((group) => ({
    group,
    sections: visible.filter((section) => section.group === group),
  })).filter((entry) => entry.sections.length > 0);
}

/** Resolves a path under /admin back to its section, for guarding a page. */
export function sectionForPath(path: string): AdminSection | undefined {
  const normalised = path.replace(/\/+$/, "");
  return ADMIN_SECTIONS.find((section) => section.path === normalised);
}
