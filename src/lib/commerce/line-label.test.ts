import { describe, expect, it } from "vitest";

import { BUILD_TYPES } from "@/config/products";
import { lineLabel } from "./line-label";

describe("lineLabel", () => {
  it("resolves a build line, carrying the tier", () => {
    expect(lineLabel({ translationKey: "build.website", scopeTier: "advanced" })).toEqual(
      {
        kind: "build",
        buildType: "website",
        tier: "advanced",
      },
    );
  });

  it("resolves a build line for every build type the platform sells", () => {
    for (const buildType of BUILD_TYPES) {
      expect(lineLabel({ translationKey: `build.${buildType}` })).toEqual({
        kind: "build",
        buildType,
        tier: null,
      });
    }
  });

  it("drops a tier it does not recognise rather than printing it", () => {
    // `scopeTier` is a nullable column, and an older row may hold a tier that
    // has since been withdrawn. The line still names its build type.
    expect(lineLabel({ translationKey: "build.website", scopeTier: "platinum" })).toEqual(
      {
        kind: "build",
        buildType: "website",
        tier: null,
      },
    );
  });

  it("resolves the design service", () => {
    expect(lineLabel({ translationKey: "service.design" })).toEqual({
      kind: "design_service",
    });
  });

  it("points a feature line at the name the customer chose it by", () => {
    expect(lineLabel({ translationKey: "feature.cms_editing" })).toEqual({
      kind: "capability",
      capability: "cms_editing",
    });
  });

  it("returns null when there is nothing to translate", () => {
    // Orders placed before the key was snapshotted fall back to productName.
    expect(lineLabel({ translationKey: null })).toBeNull();
    expect(lineLabel({ translationKey: undefined })).toBeNull();
    expect(lineLabel({ translationKey: "" })).toBeNull();
  });

  it("returns null for anything it cannot verify rather than guessing", () => {
    // A key naming something that no longer exists must fall back to the
    // stored name, never render a raw message path onto an invoice.
    expect(lineLabel({ translationKey: "build.hologram" })).toBeNull();
    expect(lineLabel({ translationKey: "feature.telepathy" })).toBeNull();
    expect(lineLabel({ translationKey: "service.gardening" })).toBeNull();
    expect(lineLabel({ translationKey: "surcharge.rush" })).toBeNull();
    expect(lineLabel({ translationKey: "build" })).toBeNull();
    expect(lineLabel({ translationKey: ".website" })).toBeNull();
    expect(lineLabel({ translationKey: "build." })).toBeNull();
  });
});
