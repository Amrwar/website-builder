import { describe, expect, it } from "vitest";

import {
  DEFAULT_ROLE,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLE_RANK,
  STAFF_ROLES,
  USER_ROLES,
  assignableRoles,
  canAssignRole,
  canManageUser,
  isStaffRole,
  isUserRole,
  permissionsFor,
  roleHasPermission,
  type Permission,
} from "./roles";

describe("role definitions", () => {
  it("covers every role the company actually has", () => {
    expect([...USER_ROLES].sort()).toEqual(
      [
        "admin",
        "customer",
        "designer",
        "developer",
        "finance",
        "owner",
        "project_manager",
        "qa",
        "support",
      ].sort(),
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

  it("gives every role a rank", () => {
    for (const role of USER_ROLES) {
      expect(ROLE_RANK[role], role).toBeTypeOf("number");
    }
  });

  it("defaults to the least-privileged role", () => {
    // A new account must never arrive with elevated access.
    expect(DEFAULT_ROLE).toBe("customer");
    expect(permissionsFor(DEFAULT_ROLE)).not.toContain("admin:access");
    expect(ROLE_RANK[DEFAULT_ROLE]).toBe(0);
  });
});

describe("customers are confined to their own account", () => {
  const forbidden: Permission[] = PERMISSIONS.filter(
    (permission) => permission !== "account:manage" && permission !== "project:create",
  );

  it.each(forbidden)("a customer cannot %s", (permission) => {
    expect(roleHasPermission("customer", permission)).toBe(false);
  });

  it("can still manage their own account and order builds", () => {
    expect(roleHasPermission("customer", "account:manage")).toBe(true);
    expect(roleHasPermission("customer", "project:create")).toBe(true);
  });

  it("outranks nobody, so cannot manage any account", () => {
    for (const role of USER_ROLES) {
      expect(canManageUser("customer", role), role).toBe(false);
    }
  });
});

describe("privilege separation between staff roles", () => {
  it("reserves role assignment to the two senior ranks", () => {
    for (const role of USER_ROLES) {
      expect(roleHasPermission(role, "user:manage"), role).toBe(
        role === "owner" || role === "admin",
      );
    }
  });

  it("reserves sending money back to the two senior ranks", () => {
    // Finance prepares a refund; only owner or admin releases it.
    for (const role of USER_ROLES) {
      expect(roleHasPermission(role, "refund:execute"), role).toBe(
        role === "owner" || role === "admin",
      );
    }
  });

  it("lets finance raise a refund without being able to execute it", () => {
    expect(roleHasPermission("finance", "billing:manage")).toBe(true);
    expect(roleHasPermission("finance", "refund:execute")).toBe(false);
  });

  it("keeps platform configuration with the owner alone", () => {
    for (const role of USER_ROLES) {
      expect(roleHasPermission(role, "settings:manage"), role).toBe(role === "owner");
    }
  });

  it("keeps commercial detail away from delivery staff", () => {
    // A designer needs to know whose project it is, not their VAT number.
    for (const role of ["developer", "designer", "qa"] as const) {
      expect(roleHasPermission(role, "customer:read:sensitive"), role).toBe(false);
      expect(roleHasPermission(role, "finance:read"), role).toBe(false);
    }
    expect(roleHasPermission("finance", "customer:read:sensitive")).toBe(true);
  });

  it("keeps delivery authority away from finance", () => {
    expect(roleHasPermission("finance", "project:manage")).toBe(false);
    expect(roleHasPermission("finance", "build:execute")).toBe(false);
  });

  it("separates the crafts", () => {
    expect(roleHasPermission("developer", "design:manage")).toBe(false);
    expect(roleHasPermission("designer", "build:execute")).toBe(false);
    expect(roleHasPermission("qa", "build:execute")).toBe(false);
    expect(roleHasPermission("developer", "qa:execute")).toBe(false);
  });

  it("stops support changing scope, price or deadline", () => {
    expect(roleHasPermission("support", "project:manage")).toBe(false);
    expect(roleHasPermission("support", "billing:manage")).toBe(false);
  });

  it("gives the owner every permission", () => {
    for (const permission of PERMISSIONS) {
      expect(roleHasPermission("owner", permission), permission).toBe(true);
    }
  });

  it("gives the administrator everything operational except configuration", () => {
    for (const permission of PERMISSIONS) {
      expect(roleHasPermission("admin", permission), permission).toBe(
        permission !== "settings:manage",
      );
    }
  });

  it("restricts the audit log to the two senior ranks", () => {
    for (const role of USER_ROLES) {
      expect(roleHasPermission(role, "audit:read"), role).toBe(
        role === "owner" || role === "admin",
      );
    }
  });
});

describe("the rank ladder stops self-promotion", () => {
  it("refuses a role at or above the actor's own rank", () => {
    // Without this, anyone holding user:manage could make themselves owner and
    // every other separation here would be theatre.
    expect(canAssignRole("admin", "owner")).toBe(false);
    expect(canAssignRole("admin", "admin")).toBe(false);
    expect(canAssignRole("owner", "owner")).toBe(false);
  });

  it("lets the owner appoint an administrator", () => {
    expect(canAssignRole("owner", "admin")).toBe(true);
  });

  it("lets an administrator appoint anyone below them", () => {
    for (const role of ["project_manager", "finance", "developer", "support"] as const) {
      expect(canAssignRole("admin", role), role).toBe(true);
    }
  });

  it("refuses anyone without user:manage, whatever their rank", () => {
    for (const role of USER_ROLES) {
      if (role === "owner" || role === "admin") continue;
      expect(canAssignRole(role, "customer"), role).toBe(false);
    }
  });

  it("stops two administrators demoting each other", () => {
    expect(canManageUser("admin", "admin")).toBe(false);
    expect(canManageUser("admin", "owner")).toBe(false);
  });

  it("lets the owner manage an administrator", () => {
    expect(canManageUser("owner", "admin")).toBe(true);
  });

  it("offers a selector only of roles the actor may actually grant", () => {
    const forAdmin = assignableRoles("admin");
    expect(forAdmin).not.toContain("owner");
    expect(forAdmin).not.toContain("admin");
    expect(forAdmin).toContain("developer");

    expect(assignableRoles("support")).toEqual([]);
  });

  it("never lets a role assign its own rank, for every role", () => {
    for (const role of USER_ROLES) {
      expect(canAssignRole(role, role), role).toBe(false);
    }
  });
});

describe("staff classification", () => {
  it("treats everyone except customers as staff", () => {
    expect(isStaffRole("customer")).toBe(false);
    for (const role of STAFF_ROLES) expect(isStaffRole(role), role).toBe(true);
  });

  it("gives every staff role console access and their own account", () => {
    for (const role of STAFF_ROLES) {
      expect(roleHasPermission(role, "admin:access"), role).toBe(true);
      expect(roleHasPermission(role, "account:manage"), role).toBe(true);
    }
  });
});

describe("role narrowing of untrusted input", () => {
  it("accepts only known roles", () => {
    for (const role of USER_ROLES) {
      expect(isUserRole(role), role).toBe(true);
    }
  });

  it("rejects anything else", () => {
    // Guards against a webhook payload or form field smuggling a role in.
    for (const value of ["superadmin", "ADMIN", "", null, undefined, 1, {}, ["admin"]]) {
      expect(isUserRole(value), JSON.stringify(value)).toBe(false);
    }
  });
});

describe("the permission table is exhaustive", () => {
  it("grants every declared permission to at least one role", () => {
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

  it("ranks every staff role above customer", () => {
    for (const role of STAFF_ROLES) {
      expect(ROLE_RANK[role], role).toBeGreaterThan(ROLE_RANK.customer);
    }
  });
});
