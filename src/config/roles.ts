/**
 * Roles and permissions.
 *
 * Deliberately plain data with no database or Clerk imports, so this module is
 * safe to pull into a client bundle for rendering decisions. It is *not* the
 * authorization boundary: the server re-derives permissions from the stored
 * role on every protected call, because anything a client can read, a client
 * can lie about.
 *
 * These are staff roles inside one company, not per-tenant roles, which is why
 * they live here rather than in Clerk Organizations. Clerk owns identity; the
 * database owns what a person is allowed to do.
 */

export const USER_ROLES = [
  "customer",
  "owner",
  "admin",
  "project_manager",
  "finance",
  "developer",
  "designer",
  "qa",
  "support",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const DEFAULT_ROLE: UserRole = "customer";

/** Everyone who is not a paying customer; used for staff-only surfaces. */
export const STAFF_ROLES: readonly UserRole[] = USER_ROLES.filter(
  (role) => role !== "customer",
);

/**
 * Seniority, used only for deciding who may change whose role.
 *
 * Separate from permissions on purpose. A permission answers "may this person
 * do this thing"; rank answers "may this person do it *to that person*".
 * Without rank, anyone holding `user:manage` could promote themselves, which
 * makes every other separation in this file decorative.
 */
export const ROLE_RANK: Record<UserRole, number> = {
  owner: 100,
  admin: 90,
  project_manager: 60,
  finance: 60,
  developer: 40,
  designer: 40,
  qa: 40,
  support: 30,
  customer: 0,
};

/**
 * Permissions, named for the action rather than the role.
 *
 * Checking a permission rather than a role is what stops authorization drifting
 * as the team grows: adding a role means editing this one table, not hunting
 * for every `role === "admin"` in the codebase.
 */
export const PERMISSIONS = [
  /** Read and edit one's own account and preferences. */
  "account:manage",
  /** Create and configure one's own builds. */
  "project:create",
  /** See every project in the system, not only one's own. */
  "project:read:all",
  /** Change scope, price or deadline on any project. */
  "project:manage",
  /** Move a build through its stages and publish previews. */
  "build:execute",
  /** Upload and change design assets on any project. */
  "design:manage",
  /** Run and sign off quality passes. */
  "qa:execute",
  /** Read and answer customer messages. */
  "support:respond",
  /** Read customer records: name, projects, activity. */
  "customer:read",
  /**
   * Read a customer's commercial details -- tax identifiers, billing country,
   * invoice history. Separate from `customer:read` because a designer needs to
   * know whose project it is, not what their VAT number is.
   */
  "customer:read:sensitive",
  /** Read payments, invoices and revenue figures. */
  "finance:read",
  /** Record and correct billing records, and raise a refund request. */
  "billing:manage",
  /**
   * Actually send money back. Deliberately separate from `billing:manage`:
   * raising a refund and approving one are two acts, and the segregation is
   * what stops a single compromised account emptying the account.
   */
  "refund:execute",
  /** Change another user's role, subject to the rank ladder. */
  "user:manage",
  /** Read the audit log. */
  "audit:read",
  /** Change platform configuration: pricing tables, policies, thresholds. */
  "settings:manage",
  /** Read aggregate business figures. */
  "analytics:read",
  /** Reach the staff console at all. */
  "admin:access",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const CUSTOMER_PERMISSIONS: readonly Permission[] = ["account:manage", "project:create"];

/** Everything an administrator can do. The owner additionally holds settings. */
const ADMIN_PERMISSIONS: readonly Permission[] = PERMISSIONS.filter(
  (permission) => permission !== "settings:manage",
);

/**
 * Role to permissions.
 *
 * Every staff role keeps `account:manage` -- staff have accounts too -- and
 * `admin:access`, which only gates reaching the console, never what can be
 * done inside it.
 */
export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  customer: CUSTOMER_PERMISSIONS,

  /**
   * The business owner. Everything, including platform configuration, and the
   * only rank that can appoint an administrator.
   */
  owner: PERMISSIONS,

  /**
   * Runs the business day to day. Everything operational -- including refunds
   * and the audit log -- but not platform configuration, because pricing
   * tables and tax policy are the owner's commercial decisions.
   */
  admin: ADMIN_PERMISSIONS,

  project_manager: [
    "account:manage",
    "admin:access",
    "project:read:all",
    "project:manage",
    "support:respond",
    "customer:read",
    "analytics:read",
  ],

  /**
   * Money in and out. Can see and record everything financial and raise a
   * refund, but cannot execute one and cannot touch scope or delivery --
   * the person who prepares a payment is not the person who releases it.
   */
  finance: [
    "account:manage",
    "admin:access",
    "project:read:all",
    "customer:read",
    "customer:read:sensitive",
    "finance:read",
    "billing:manage",
    "analytics:read",
  ],

  developer: ["account:manage", "admin:access", "project:read:all", "build:execute"],

  designer: ["account:manage", "admin:access", "project:read:all", "design:manage"],

  qa: ["account:manage", "admin:access", "project:read:all", "qa:execute"],

  support: [
    "account:manage",
    "admin:access",
    "project:read:all",
    "support:respond",
    "customer:read",
  ],
};

export function permissionsFor(role: UserRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function isStaffRole(role: UserRole): boolean {
  return role !== "customer";
}

/** Narrows untrusted input (a webhook payload, a form field) to a known role. */
export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

/**
 * Whether `actor` may set someone's role to `target`.
 *
 * Two rules, and the first is the one that matters:
 *
 *  1. **You cannot grant a role at or above your own rank.** Without this, any
 *     holder of `user:manage` could promote themselves to owner, and every
 *     other separation in this file would be theatre.
 *  2. You must hold `user:manage` at all.
 *
 * The owner is the only rank that can appoint an administrator, which follows
 * from (1) rather than being special-cased.
 */
export function canAssignRole(actorRole: UserRole, targetRole: UserRole): boolean {
  if (!roleHasPermission(actorRole, "user:manage")) return false;
  return ROLE_RANK[targetRole] < ROLE_RANK[actorRole];
}

/**
 * Whether `actor` may modify the account of someone currently holding
 * `subjectRole`.
 *
 * Prevents sideways attacks: two administrators must not be able to demote
 * each other, and nobody may act on someone who outranks them.
 */
export function canManageUser(actorRole: UserRole, subjectRole: UserRole): boolean {
  if (!roleHasPermission(actorRole, "user:manage")) return false;
  return ROLE_RANK[subjectRole] < ROLE_RANK[actorRole];
}

/** Roles `actor` is allowed to pick from, for rendering a role selector. */
export function assignableRoles(actorRole: UserRole): readonly UserRole[] {
  return USER_ROLES.filter((role) => canAssignRole(actorRole, role));
}
