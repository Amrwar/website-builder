import { describe, expect, it } from "vitest";

import {
  ADMIN_GROUPS,
  ADMIN_SECTIONS,
  canSeeSection,
  groupedSectionsFor,
  sectionForPath,
  sectionsFor,
} from "./admin-nav";
import { PERMISSIONS, USER_ROLES, roleHasPermission } from "./roles";

/**
 * The admin information architecture.
 *
 * The brief's instruction was "do not show every section to every role", so
 * these tests are mostly about what each role *cannot* see. The navigation is
 * only a convenience -- every page re-checks server-side -- but a sidebar that
 * advertises a section a role cannot open is a bug either way.
 */

describe("the section declarations are sound", () => {
  it("gives every section a unique id and path", () => {
    const ids = ADMIN_SECTIONS.map((section) => section.id);
    const paths = ADMIN_SECTIONS.map((section) => section.path);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("requires only permissions that exist", () => {
    for (const section of ADMIN_SECTIONS) {
      for (const permission of section.requires) {
        expect(PERMISSIONS, `${section.id} requires unknown ${permission}`).toContain(
          permission,
        );
      }
    }
  });

  it("requires at least one permission for every section", () => {
    // A section with no requirement would be visible to a signed-out visitor
    // the moment someone forgot the page guard.
    for (const section of ADMIN_SECTIONS) {
      expect(section.requires.length, section.id).toBeGreaterThan(0);
    }
  });

  it("places every section in a declared group", () => {
    for (const section of ADMIN_SECTIONS) {
      expect(ADMIN_GROUPS, section.id).toContain(section.group);
    }
  });

  it("gives every planned section the phase it arrives in", () => {
    // A "planned" page states when it is coming. Without that it is just an
    // empty page, which is the thing the status exists to avoid.
    for (const section of ADMIN_SECTIONS) {
      if (section.status === "planned") {
        expect(section.plannedFor, section.id).toBeGreaterThan(9);
      }
    }
  });

  it("resolves a path back to its section", () => {
    expect(sectionForPath("/queue")?.id).toBe("queue");
    expect(sectionForPath("")?.id).toBe("dashboard");
    expect(sectionForPath("/nope")).toBeUndefined();
  });
});

describe("customers reach none of it", () => {
  it("sees no sections at all", () => {
    expect(sectionsFor("customer")).toEqual([]);
  });

  it("is refused every single section individually", () => {
    for (const section of ADMIN_SECTIONS) {
      expect(canSeeSection("customer", section), section.id).toBe(false);
    }
  });
});

describe("roles see different consoles", () => {
  it("gives the owner everything", () => {
    expect(sectionsFor("owner")).toHaveLength(ADMIN_SECTIONS.length);
  });

  it("withholds settings from the administrator", () => {
    const ids = sectionsFor("admin").map((section) => section.id);
    expect(ids).not.toContain("settings");
    expect(ids).toContain("audit");
    expect(ids).toContain("refunds");
  });

  it("keeps money away from delivery staff", () => {
    for (const role of ["developer", "designer", "qa"] as const) {
      const ids = sectionsFor(role).map((section) => section.id);
      expect(ids, role).not.toContain("payments");
      expect(ids, role).not.toContain("invoices");
      expect(ids, role).not.toContain("refunds");
      expect(ids, role).not.toContain("pricing");
    }
  });

  it("keeps delivery control away from finance", () => {
    const ids = sectionsFor("finance").map((section) => section.id);
    expect(ids).toContain("payments");
    expect(ids).toContain("refunds");
    expect(ids).not.toContain("domains");
    expect(ids).not.toContain("hosting");
  });

  it("keeps the audit log to the two senior ranks", () => {
    for (const role of USER_ROLES) {
      const canSee = sectionsFor(role).some((section) => section.id === "audit");
      expect(canSee, role).toBe(role === "owner" || role === "admin");
    }
  });

  it("keeps the team screen to those who can actually change roles", () => {
    for (const role of USER_ROLES) {
      const canSee = sectionsFor(role).some((section) => section.id === "team");
      expect(canSee, role).toBe(roleHasPermission(role, "user:manage"));
    }
  });

  it("gives every staff role the dashboard and the queue", () => {
    for (const role of USER_ROLES) {
      if (role === "customer") continue;
      const ids = sectionsFor(role).map((section) => section.id);
      expect(ids, role).toContain("dashboard");
      expect(ids, role).toContain("queue");
    }
  });

  it("shows a developer a genuinely smaller console than an administrator", () => {
    expect(sectionsFor("developer").length).toBeLessThan(sectionsFor("admin").length);
  });
});

describe("navigation never advertises what a role cannot open", () => {
  it("only groups sections the role may see", () => {
    for (const role of USER_ROLES) {
      for (const { sections } of groupedSectionsFor(role)) {
        for (const section of sections) {
          expect(canSeeSection(role, section), `${role}/${section.id}`).toBe(true);
        }
      }
    }
  });

  it("drops empty groups rather than rendering a heading with nothing under it", () => {
    for (const role of USER_ROLES) {
      for (const { sections } of groupedSectionsFor(role)) {
        expect(sections.length).toBeGreaterThan(0);
      }
    }
  });

  it("requires every listed permission, not merely one of them", () => {
    // "Any" semantics would quietly widen access as the matrix grows.
    const multi = ADMIN_SECTIONS.find((section) => section.requires.length > 1);
    if (!multi) return;

    for (const role of USER_ROLES) {
      const holdsAll = multi.requires.every((permission) =>
        roleHasPermission(role, permission),
      );
      expect(canSeeSection(role, multi), role).toBe(holdsAll);
    }
  });
});
