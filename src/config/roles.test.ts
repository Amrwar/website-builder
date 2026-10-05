import { describe, expect, it } from "vitest";

import {
  DEFAULT_ROLE,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  STAFF_ROLES,
  USER_ROLES,
  isStaffRole,
  isUserRole,
  permissionsFor,
  roleHasPermission,
  type Permission,
} from "./roles";

describe("role definitions", () => {
  it("covers every role named in the product brief", () => {
    expect([...USER_ROLES].sort()).toEqual(
      ["admin", "customer", "designer", "developer", "project_manager", "support"].sort(),
    );
  });

  it("defines permissions for every role, with no unknown entries", () => {
    for (const role of USER_ROLES) {
      const granted = permissionsFor(role);
      expect(granted.length, `${role} has no permissions`).toBeGreaterThan(0);
      for (const permission of granted) {
        expect(PERMISSIONS, `${role} grants unknown "${permission}"`).toContain(
          permission,
        );
      }
    }
  });

  it("defaults to the least-privileged role", () => {
    // A new account must never arrive with elevated access.
    expect(DEFAULT_ROLE).toBe("customer");
    expect(permissionsFor(DEFAULT_ROLE)).not.toContain("admin:access");
  });
});

describe("customers are confined to their own account", () => {
  const forbidden: Permission[] = [
    "admin:access",
    "project:read:all",
    "project:manage",
    "build:execute",
    "design:manage",
    "support:respond",
    "billing:manage",
    "user:manage",
  ];

  it.each(forbidden)("a customer cannot %s", (permission) => {
    expect(roleHasPermission("customer", permission)).toBe(false);
  });

  it("a customer can still manage their own account and order builds", () => {
    expect(roleHasPermission("customer", "account:manage")).toBe(true);
    expect(roleHasPermission("customer", "project:create")).toBe(true);
  });
});

describe("privilege separation between staff roles", () => {
  it("only admins may change another user's role", () => {
    // Role assignment is the keys to the kingdom: anyone who can set roles can
    // grant themselves everything else.
    for (const role of USER_ROLES) {
      expect(roleHasPermission(role, "user:manage")).toBe(role === "admin");
    }
  });

  it("only admins may issue refunds", () => {
    for (const role of USER_ROLES) {
      expect(roleHasPermission(role, "billing:manage")).toBe(role === "admin");
    }
  });

  it("a developer cannot change design assets", () => {
    expect(roleHasPermission("developer", "design:manage")).toBe(false);
  });

  it("a designer cannot move a build through its stages", () => {
    expect(roleHasPermission("designer", "build:execute")).toBe(false);
  });

  it("support cannot change scope, price or deadline", () => {
    expect(roleHasPermission("support", "project:manage")).toBe(false);
  });

  it("admin holds every permission", () => {
    for (const permission of PERMISSIONS) {
      expect(roleHasPermission("admin", permission)).toBe(true);
    }
  });
});

describe("staff classification", () => {
  it("treats everyone except customers as staff", () => {
    expect(isStaffRole("customer")).toBe(false);
    for (const role of STAFF_ROLES) expect(isStaffRole(role)).toBe(true);
  });

  it("gives every staff role console access and their own account", () => {
    for (const role of STAFF_ROLES) {
      expect(roleHasPermission(role, "admin:access")).toBe(true);
      expect(roleHasPermission(role, "account:manage")).toBe(true);
    }
  });
});

describe("role narrowing of untrusted input", () => {
  it("accepts only known roles", () => {
    expect(isUserRole("admin")).toBe(true);
    expect(isUserRole("customer")).toBe(true);
  });

  it("rejects anything else", () => {
    // Guards against a webhook payload or form field smuggling a role in.
    for (const value of ["superadmin", "ADMIN", "", null, undefined, 1, {}, ["admin"]]) {
      expect(isUserRole(value), `accepted ${JSON.stringify(value)}`).toBe(false);
    }
  });
});

describe("the permission table is exhaustive", () => {
  it("grants every declared permission to at least one role", () => {
    // An unreachable permission is either dead code or a forgotten grant.
    for (const permission of PERMISSIONS) {
      const holders = USER_ROLES.filter((role) => roleHasPermission(role, permission));
      expect(holders.length, `nobody can ${permission}`).toBeGreaterThan(0);
    }
  });

  it("has no duplicate grants", () => {
    for (const [role, granted] of Object.entries(ROLE_PERMISSIONS)) {
      expect(new Set(granted).size, `${role} lists a permission twice`).toBe(
        granted.length,
      );
    }
  });
});
