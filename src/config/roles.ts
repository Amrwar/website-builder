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
  "admin",
  "project_manager",
  "developer",
  "designer",
  "support",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const DEFAULT_ROLE: UserRole = "customer";

/** Everyone who is not a paying customer; used for staff-only surfaces. */
export const STAFF_ROLES: readonly UserRole[] = USER_ROLES.filter(
  (role) => role !== "customer",
);

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
  /** Read and answer customer messages. */
  "support:respond",
  /** Issue refunds and change billing records. */
  "billing:manage",
  /** Change another user's role. */
  "user:manage",
  /** Reach the staff console at all. */
  "admin:access",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const CUSTOMER_PERMISSIONS: readonly Permission[] = ["account:manage", "project:create"];

/**
 * Role to permissions.
 *
 * Every staff role keeps `account:manage` -- staff have accounts too -- and
 * `admin:access`, which only gates reaching the console, never what can be
 * done inside it.
 */
export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  customer: CUSTOMER_PERMISSIONS,

  admin: PERMISSIONS,

  project_manager: [
    "account:manage",
    "admin:access",
    "project:read:all",
    "project:manage",
    "support:respond",
  ],

  developer: ["account:manage", "admin:access", "project:read:all", "build:execute"],

  designer: ["account:manage", "admin:access", "project:read:all", "design:manage"],

  support: ["account:manage", "admin:access", "project:read:all", "support:respond"],
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
