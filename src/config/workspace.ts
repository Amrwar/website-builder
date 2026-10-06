import type { ProductType } from "@/db/schema/enums";
import type { ProjectStatus } from "@/db/schema/enums";

/**
 * Build Room configuration.
 *
 * The workspace is driven by this file rather than by `if (buildType === …)`
 * branches scattered through the UI. A new product type -- an automation, a
 * business product, a feature upgrade -- becomes an entry here, not a rewrite
 * of the room.
 *
 * Three things vary by product type and nothing else does:
 *
 *   stages    the sequence of milestones the work moves through
 *   panels    which sections of the room are meaningful
 *   approvals which sign-offs are collected
 *
 * Everything else -- the timeline, files, messages, change requests, the
 * activity feed -- is identical for every product, which is the point.
 */

/* -------------------------------------------------------------------------
 * Panels
 * ---------------------------------------------------------------------- */

export const WORKSPACE_PANELS = [
  "overview",
  "timeline",
  "preview",
  "files",
  "messages",
  "changes",
  "approvals",
  "payments",
  "launch",
] as const;

export type WorkspacePanel = (typeof WORKSPACE_PANELS)[number];

/* -------------------------------------------------------------------------
 * Stages
 * ---------------------------------------------------------------------- */

/**
 * A milestone in the customer's view of the work.
 *
 * Deliberately coarser than `project_status`: statuses are a state machine the
 * system transitions through, stages are what a customer recognises as
 * progress. Mapping one to the other here keeps the internal machine free to
 * gain states without changing what the customer sees.
 */
export interface WorkspaceStage {
  id: string;
  /** Statuses that mean this stage is the current one. */
  statuses: readonly ProjectStatus[];
  /** True when the guaranteed countdown is running during this stage. */
  countdownRunning?: boolean;
}

/** The default sequence, used by every build product. */
const BUILD_STAGES = [
  { id: "ordered", statuses: ["draft", "quoted", "awaiting_payment"] },
  { id: "assets", statuses: ["awaiting_assets"] },
  { id: "build", statuses: ["in_build"], countdownRunning: true },
  { id: "preview", statuses: ["in_preview"], countdownRunning: true },
  { id: "approval", statuses: ["awaiting_approval", "approved"] },
  { id: "launch", statuses: ["launching", "launched"] },
] as const satisfies readonly WorkspaceStage[];

/**
 * Automations and business products skip the preview-and-approve loop around a
 * deployed artefact: there is no URL to look at. They are listed explicitly
 * rather than falling back to the build sequence, so adding one is a decision
 * someone made rather than an accident of defaulting.
 */
const DELIVERABLE_STAGES = [
  { id: "ordered", statuses: ["draft", "quoted", "awaiting_payment"] },
  { id: "assets", statuses: ["awaiting_assets"] },
  { id: "build", statuses: ["in_build", "in_preview"], countdownRunning: true },
  { id: "approval", statuses: ["awaiting_approval", "approved"] },
  { id: "handover", statuses: ["launching", "launched"] },
] as const satisfies readonly WorkspaceStage[];

/* -------------------------------------------------------------------------
 * Approvals
 * ---------------------------------------------------------------------- */

export const APPROVAL_KINDS = ["scope", "design", "preview", "launch"] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

/* -------------------------------------------------------------------------
 * Per-product configuration
 * ---------------------------------------------------------------------- */

export interface WorkspaceDefinition {
  stages: readonly WorkspaceStage[];
  panels: readonly WorkspacePanel[];
  approvals: readonly ApprovalKind[];
  /** True when delivery involves a URL the customer can open. */
  hasPreviewUrl: boolean;
  /** True when a third party reviews the result outside our guarantee. */
  hasExternalReview: boolean;
}

const ALL_PANELS = WORKSPACE_PANELS;

const WORKSPACE_BY_PRODUCT: Record<ProductType, WorkspaceDefinition> = {
  build: {
    stages: BUILD_STAGES,
    panels: ALL_PANELS,
    approvals: ["scope", "design", "preview", "launch"],
    hasPreviewUrl: true,
    hasExternalReview: false,
  },
  design_service: {
    stages: DELIVERABLE_STAGES,
    // No preview URL and nothing to deploy, so those panels would be empty
    // chrome rather than useful space.
    panels: [
      "overview",
      "timeline",
      "files",
      "messages",
      "changes",
      "approvals",
      "payments",
    ],
    approvals: ["design"],
    hasPreviewUrl: false,
    hasExternalReview: false,
  },
  maintenance_plan: {
    stages: DELIVERABLE_STAGES,
    panels: ["overview", "timeline", "messages", "payments"],
    approvals: [],
    hasPreviewUrl: false,
    hasExternalReview: false,
  },
  build_credit: {
    stages: DELIVERABLE_STAGES,
    panels: ["overview", "timeline", "payments"],
    approvals: [],
    hasPreviewUrl: false,
    hasExternalReview: false,
  },
  automation: {
    stages: DELIVERABLE_STAGES,
    panels: [
      "overview",
      "timeline",
      "files",
      "messages",
      "changes",
      "approvals",
      "payments",
    ],
    approvals: ["scope", "preview"],
    hasPreviewUrl: false,
    hasExternalReview: false,
  },
  business_product: {
    stages: DELIVERABLE_STAGES,
    panels: ALL_PANELS,
    approvals: ["scope", "preview", "launch"],
    hasPreviewUrl: true,
    hasExternalReview: false,
  },
};

export function workspaceFor(productType: ProductType): WorkspaceDefinition {
  return WORKSPACE_BY_PRODUCT[productType];
}

/** True when the panel is meaningful for this product. */
export function hasPanel(productType: ProductType, panel: WorkspacePanel): boolean {
  return workspaceFor(productType).panels.includes(panel);
}

/**
 * Resolves the current stage from a status.
 *
 * Returns null for terminal states that sit outside the sequence -- a
 * cancelled project has no current stage, and pretending it is still at one
 * would misrepresent it on the timeline.
 */
export function currentStageFor(
  productType: ProductType,
  status: ProjectStatus,
): WorkspaceStage | null {
  return (
    workspaceFor(productType).stages.find((stage) =>
      (stage.statuses as readonly ProjectStatus[]).includes(status),
    ) ?? null
  );
}

export type StageState = "complete" | "current" | "upcoming";

/** Classifies every stage for the timeline, in order. */
export function stageStates(
  productType: ProductType,
  status: ProjectStatus,
): { stage: WorkspaceStage; state: StageState }[] {
  const { stages } = workspaceFor(productType);
  const currentIndex = stages.findIndex((stage) =>
    (stage.statuses as readonly ProjectStatus[]).includes(status),
  );

  return stages.map((stage, index) => ({
    stage,
    state:
      currentIndex === -1
        ? "upcoming"
        : index < currentIndex
          ? "complete"
          : index === currentIndex
            ? "current"
            : "upcoming",
  }));
}

/** True when the guaranteed countdown runs in this status. */
export function countdownRuns(productType: ProductType, status: ProjectStatus): boolean {
  return currentStageFor(productType, status)?.countdownRunning === true;
}

/* -------------------------------------------------------------------------
 * What the customer has to do next
 * ---------------------------------------------------------------------- */

/**
 * The single next action, by status.
 *
 * One per state, because a workspace that lists five things a customer *could*
 * do tells them nothing about what is actually blocking delivery. `null` means
 * the ball is in our court, which is itself worth saying.
 */
export const NEXT_ACTION_BY_STATUS: Record<ProjectStatus, string | null> = {
  draft: "configure",
  quoted: "pay",
  awaiting_quote: null,
  awaiting_payment: "pay",
  awaiting_assets: "submitAssets",
  in_build: null,
  in_preview: "reviewPreview",
  awaiting_approval: "approve",
  approved: null,
  launching: null,
  launched: null,
  cancelled: null,
};
