import { describe, expect, it } from "vitest";

import { PRODUCT_TYPES, PROJECT_STATUSES } from "@/db/schema/enums";
import {
  APPROVAL_KINDS,
  NEXT_ACTION_BY_STATUS,
  WORKSPACE_PANELS,
  countdownRuns,
  currentStageFor,
  hasPanel,
  stageStates,
  workspaceFor,
} from "./workspace";

/**
 * The Build Room is meant to be reusable for product types that do not exist
 * yet. These tests are what that claim means in practice: every product type
 * resolves, no panel or stage is hardcoded to websites, and the countdown is
 * declared in exactly the stages where it genuinely runs.
 */

describe("every product type has a workspace", () => {
  it("resolves for all of them, including the ones not yet sold", () => {
    for (const productType of PRODUCT_TYPES) {
      const definition = workspaceFor(productType);
      expect(definition, productType).toBeDefined();
      expect(definition.stages.length, productType).toBeGreaterThan(0);
      expect(definition.panels.length, productType).toBeGreaterThan(0);
    }
  });

  it("declares only panels that exist", () => {
    for (const productType of PRODUCT_TYPES) {
      for (const panel of workspaceFor(productType).panels) {
        expect(WORKSPACE_PANELS, `${productType}/${panel}`).toContain(panel);
      }
    }
  });

  it("declares only approval kinds that exist", () => {
    for (const productType of PRODUCT_TYPES) {
      for (const kind of workspaceFor(productType).approvals) {
        expect(APPROVAL_KINDS, `${productType}/${kind}`).toContain(kind);
      }
    }
  });

  it("gives every product the panels that are universal", () => {
    // Overview and timeline are the workspace; a product without them is not
    // using this room at all.
    for (const productType of PRODUCT_TYPES) {
      expect(hasPanel(productType, "overview"), productType).toBe(true);
      expect(hasPanel(productType, "timeline"), productType).toBe(true);
    }
  });

  it("only offers a preview panel to products that have a preview URL", () => {
    for (const productType of PRODUCT_TYPES) {
      const definition = workspaceFor(productType);
      if (hasPanel(productType, "preview")) {
        expect(definition.hasPreviewUrl, productType).toBe(true);
      }
    }
  });
});

describe("the room is not hardcoded around websites", () => {
  it("gives a maintenance plan a smaller room than a build", () => {
    const build = workspaceFor("build").panels.length;
    const plan = workspaceFor("maintenance_plan").panels.length;

    // Nothing asserts what a maintenance plan *is*; only that the
    // configuration is genuinely doing work rather than returning one answer.
    expect(plan).toBeLessThan(build);
  });

  it("gives an automation no preview URL but still a full timeline", () => {
    const automation = workspaceFor("automation");
    expect(automation.hasPreviewUrl).toBe(false);
    expect(automation.panels).toContain("timeline");
    expect(automation.panels).not.toContain("preview");
  });

  it("uses different stage sequences for different products", () => {
    const build = workspaceFor("build").stages.map((stage) => stage.id);
    const automation = workspaceFor("automation").stages.map((stage) => stage.id);
    expect(build).not.toEqual(automation);
  });
});

describe("stages", () => {
  it("classifies every stage for a project in build", () => {
    const states = stageStates("build", "in_build");

    expect(states.filter((entry) => entry.state === "current")).toHaveLength(1);
    expect(states.some((entry) => entry.state === "complete")).toBe(true);
    expect(states.some((entry) => entry.state === "upcoming")).toBe(true);
  });

  it("marks everything upcoming for a status outside the sequence", () => {
    // A cancelled project has no current stage; pretending it does would
    // misrepresent it on the timeline.
    const states = stageStates("build", "cancelled");
    expect(states.every((entry) => entry.state === "upcoming")).toBe(true);
    expect(currentStageFor("build", "cancelled")).toBeNull();
  });

  it("covers every project status across the build sequence", () => {
    const covered = new Set(
      workspaceFor("build").stages.flatMap((stage) => stage.statuses),
    );
    const uncovered = PROJECT_STATUSES.filter((status) => !covered.has(status));

    // Only the two genuinely off-sequence states may be uncovered.
    expect(uncovered.sort()).toEqual(["awaiting_quote", "cancelled"]);
  });
});

describe("the countdown runs only where it should", () => {
  it("does not run while waiting for the customer's assets", () => {
    // The rule the whole product is sold on, asserted at the configuration
    // level as well as in the lifecycle.
    expect(countdownRuns("build", "awaiting_assets")).toBe(false);
  });

  it("does not run before payment", () => {
    for (const status of ["draft", "quoted", "awaiting_payment"] as const) {
      expect(countdownRuns("build", status), status).toBe(false);
    }
  });

  it("runs during build and preview", () => {
    expect(countdownRuns("build", "in_build")).toBe(true);
    expect(countdownRuns("build", "in_preview")).toBe(true);
  });

  it("stops once the work is with the customer for approval", () => {
    for (const status of ["awaiting_approval", "approved", "launched"] as const) {
      expect(countdownRuns("build", status), status).toBe(false);
    }
  });

  it("holds for every product type, not just builds", () => {
    for (const productType of PRODUCT_TYPES) {
      expect(countdownRuns(productType, "awaiting_assets"), productType).toBe(false);
    }
  });
});

describe("the next action", () => {
  it("is defined for every project status", () => {
    for (const status of PROJECT_STATUSES) {
      expect(status in NEXT_ACTION_BY_STATUS, status).toBe(true);
    }
  });

  it("asks for assets exactly when the project is waiting for them", () => {
    expect(NEXT_ACTION_BY_STATUS.awaiting_assets).toBe("submitAssets");
  });

  it("asks nothing of the customer while we are building", () => {
    // The ball being in our court is itself worth saying.
    expect(NEXT_ACTION_BY_STATUS.in_build).toBeNull();
  });
});
