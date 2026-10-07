import { describe, expect, it } from "vitest";

import {
  capabilitiesForModules,
  getModule,
  modulesFor,
  PLATFORM_MODULES,
} from "./modules";
import { BUILD_TYPES } from "./products";
import { CAPABILITIES, getCapability } from "@/lib/scope";

describe("the entry registry", () => {
  it("has unique ids", () => {
    const ids = PLATFORM_MODULES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * The expensive direction to be wrong in: a module naming a capability the
   * scope engine does not know would contribute nothing to complexity or
   * price, so it would be delivered for free.
   */
  it("only names capabilities the scope engine prices", () => {
    for (const entry of PLATFORM_MODULES) {
      for (const key of entry.provides) {
        expect(getCapability(key), `${entry.id} -> ${key}`).toBeDefined();
      }
    }
  });

  it("only applies to build types that exist", () => {
    for (const entry of PLATFORM_MODULES) {
      expect(entry.appliesTo.length, entry.id).toBeGreaterThan(0);
      for (const buildType of entry.appliesTo) {
        expect(BUILD_TYPES, entry.id).toContain(buildType);
      }
    }
  });

  /**
   * A capability already refuses products it cannot apply to. A module that
   * offered one to a product the capability itself excludes would be an offer
   * the engine then declines — visible to the customer as a feature that
   * disappears after they pick it.
   */
  it("never offers a capability to a product that capability excludes", () => {
    for (const entry of PLATFORM_MODULES) {
      for (const key of entry.provides) {
        const capability = CAPABILITIES.find((c) => c.key === key);
        const appliesTo = (capability as { appliesTo?: readonly string[] } | undefined)
          ?.appliesTo;
        if (!appliesTo) continue;
        for (const buildType of entry.appliesTo) {
          expect(appliesTo, `${entry.id} offers ${key} to ${buildType}`).toContain(
            buildType,
          );
        }
      }
    }
  });

  it("gives a planned module nothing to sell", () => {
    // `planned` means declared so it has one agreed shape, not orderable. A
    // planned entry with capabilities would be priceable, which would make it
    // orderable by accident.
    for (const entry of PLATFORM_MODULES) {
      if (entry.status === "planned") {
        expect(entry.provides, entry.id).toHaveLength(0);
      }
    }
  });

  it("gives an available module something to deliver", () => {
    for (const entry of PLATFORM_MODULES) {
      if (entry.status === "available") {
        expect(entry.provides.length, entry.id).toBeGreaterThan(0);
      }
    }
  });
});

describe("modulesFor", () => {
  it("offers only what the product can carry", () => {
    for (const buildType of BUILD_TYPES) {
      for (const entry of modulesFor(buildType)) {
        expect(entry.appliesTo, entry.id).toContain(buildType);
      }
    }
  });

  it("never offers a module that does not exist yet", () => {
    for (const buildType of BUILD_TYPES) {
      for (const entry of modulesFor(buildType)) {
        expect(entry.status, entry.id).toBe("available");
      }
    }
  });
});

describe("capabilitiesForModules", () => {
  it("adds a module's capabilities together", () => {
    expect(capabilitiesForModules(["content"])).toEqual(
      expect.arrayContaining(["cms_editing", "blog"]),
    );
  });

  it("counts a shared capability once", () => {
    // CRM and analytics both want reporting. Charging twice because two boxes
    // were ticked would be indefensible.
    const combined = capabilitiesForModules(["crm", "analytics"]);
    expect(combined.filter((key) => key === "reporting")).toHaveLength(1);
  });

  it("ignores an id it does not recognise rather than throwing", () => {
    // The ids arrive from a draft, which is client state.
    expect(capabilitiesForModules(["not-a-entry"])).toEqual([]);
    expect(capabilitiesForModules(["content", "not-a-entry"])).toEqual(
      expect.arrayContaining(["cms_editing"]),
    );
  });
});

describe("getModule", () => {
  it("resolves a declared id and nothing else", () => {
    expect(getModule("booking")?.id).toBe("booking");
    expect(getModule("nope")).toBeUndefined();
  });
});
