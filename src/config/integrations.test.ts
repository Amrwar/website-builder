import { describe, expect, it } from "vitest";

import {
  getIntegration,
  INTEGRATION_CAPABILITIES,
  INTEGRATIONS,
  integrationsFor,
} from "./integrations";

describe("the integration registry", () => {
  it("has unique ids", () => {
    const ids = INTEGRATIONS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declares a capability that exists", () => {
    for (const entry of INTEGRATIONS) {
      expect(INTEGRATION_CAPABILITIES, entry.id).toContain(entry.capability);
    }
  });

  it("names a seam for every integration", () => {
    // The seam is the point of the registry: it is where a replacement goes.
    for (const entry of INTEGRATIONS) {
      expect(entry.seam, entry.id).toMatch(/^src\/.+\.tsx?$/);
    }
  });

  /**
   * Names, never values. The registry is client-safe and is read to report
   * what is missing; a value here would be a secret in the browser bundle.
   */
  it("lists environment variable names only", () => {
    for (const entry of INTEGRATIONS) {
      for (const name of entry.requires) {
        expect(name, entry.id).toMatch(/^[A-Z][A-Z0-9_]*$/);
      }
    }
  });

  it("covers every capability the platform depends on", () => {
    for (const capability of INTEGRATION_CAPABILITIES) {
      expect(integrationsFor(capability).length, capability).toBeGreaterThan(0);
    }
  });

  it("gives a blocking integration something to check", () => {
    // "Blocks when absent" with nothing to be absent is not a statement about
    // anything. The rule-based assessor is the deliberate exception: it is ours
    // and needs no credential, which is why it degrades rather than blocks.
    for (const entry of INTEGRATIONS) {
      if (entry.whenAbsent === "blocks") {
        expect(entry.requires.length, entry.id).toBeGreaterThan(0);
      }
    }
  });

  it("resolves a declared id and nothing else", () => {
    expect(getIntegration("stripe")?.capability).toBe("payments");
    expect(getIntegration("nope")).toBeUndefined();
  });
});
