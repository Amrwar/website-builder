import type { UserRole } from "@/config/roles";
import type { ProductType } from "@/db/schema/enums";

/**
 * Production workflows.
 *
 * The internal counterpart to `config/workspace.ts`. That file describes what
 * the *customer* sees -- six coarse milestones; this one describes how work
 * actually moves through the company, which is finer and differs by product.
 *
 * Both are configuration rather than code for the same reason: a new product
 * type should be an entry here, not a branch in a service. Nothing in the
 * engine asks what a website is.
 *
 * ── On weights ────────────────────────────────────────────────────────────
 * Each stage carries a `weight`: its share of the guaranteed duration. The
 * schedule and risk engines use weights to answer "how far through should we
 * be by now", so they are a planning estimate, not a promise. They are
 * deliberately coarse -- pretending to know that QA is 11.3% of a build would
 * be false precision.
 * ──────────────────────────────────────────────────────────────────────────
 */

/* -------------------------------------------------------------------------
 * Stages
 * ---------------------------------------------------------------------- */

export const PRODUCTION_STAGES = [
  "brief",
  "design",
  "development",
  "qa",
  "customer_review",
  "revision",
  "final_approval",
  "deployment",
  "launch",
] as const;

export type ProductionStageId = (typeof PRODUCTION_STAGES)[number];

export interface ProductionStage {
  id: ProductionStageId;
  /** Who owns this stage by default. Tasks inherit it unless overridden. */
  responsibleRole: UserRole;
  /**
   * Share of the guaranteed duration, as a fraction. Weights across a
   * workflow sum to 1; a test enforces that, because a workflow that sums to
   * 0.8 would quietly report every project as ahead of schedule.
   */
  weight: number;
  /**
   * True when the stage waits on the customer. The guaranteed countdown does
   * not run through these -- see `config/workspace.ts` -- so they are excluded
   * from elapsed-time arithmetic rather than counted against us.
   */
  awaitsCustomer?: boolean;
  /** Approval that must be granted before the stage can be left. */
  gate?: "scope" | "design" | "preview" | "launch";
  /** Stages that may be skipped when nothing requires them. */
  optional?: boolean;
}

export interface TaskTemplate {
  key: string;
  stage: ProductionStageId;
  /** Overrides the stage's role when the work belongs to someone else. */
  responsibleRole?: UserRole;
  /** Planning estimate in minutes. Actuals are recorded separately. */
  estimatedMinutes: number;
  priority?: "low" | "normal" | "high" | "urgent";
  /** Task keys, within the same plan, that must finish first. */
  dependsOn?: readonly string[];
}

export interface ProductionWorkflow {
  id: string;
  stages: readonly ProductionStage[];
  tasks: readonly TaskTemplate[];
  /** Milestones surfaced internally; the customer sees workspace stages. */
  milestones: readonly { key: string; stage: ProductionStageId }[];
}

/* -------------------------------------------------------------------------
 * The standard build workflow
 * ---------------------------------------------------------------------- */

const BUILD_STAGES: readonly ProductionStage[] = [
  { id: "brief", responsibleRole: "project_manager", weight: 0.08, gate: "scope" },
  { id: "design", responsibleRole: "designer", weight: 0.22, gate: "design" },
  { id: "development", responsibleRole: "developer", weight: 0.34 },
  { id: "qa", responsibleRole: "developer", weight: 0.12 },
  {
    id: "customer_review",
    responsibleRole: "customer",
    weight: 0.06,
    awaitsCustomer: true,
    gate: "preview",
  },
  { id: "revision", responsibleRole: "developer", weight: 0.1, optional: true },
  {
    id: "final_approval",
    responsibleRole: "customer",
    weight: 0.02,
    awaitsCustomer: true,
    gate: "launch",
  },
  { id: "deployment", responsibleRole: "developer", weight: 0.04 },
  { id: "launch", responsibleRole: "project_manager", weight: 0.02 },
];

const BUILD_TASKS: readonly TaskTemplate[] = [
  { key: "confirm_scope", stage: "brief", estimatedMinutes: 60, priority: "high" },
  { key: "collect_assets", stage: "brief", estimatedMinutes: 30 },
  {
    key: "design_direction",
    stage: "design",
    estimatedMinutes: 180,
    dependsOn: ["confirm_scope"],
  },
  {
    key: "design_screens",
    stage: "design",
    estimatedMinutes: 360,
    dependsOn: ["design_direction"],
  },
  {
    key: "scaffold",
    stage: "development",
    estimatedMinutes: 120,
    dependsOn: ["confirm_scope"],
  },
  {
    key: "build_screens",
    stage: "development",
    estimatedMinutes: 600,
    dependsOn: ["design_screens", "scaffold"],
  },
  {
    key: "integrate_features",
    stage: "development",
    estimatedMinutes: 300,
    dependsOn: ["scaffold"],
  },
  {
    key: "test_pass",
    stage: "qa",
    estimatedMinutes: 180,
    dependsOn: ["build_screens", "integrate_features"],
  },
  {
    key: "accessibility_pass",
    stage: "qa",
    estimatedMinutes: 90,
    dependsOn: ["build_screens"],
  },
  {
    key: "publish_preview",
    stage: "customer_review",
    estimatedMinutes: 30,
    responsibleRole: "developer",
    dependsOn: ["test_pass", "accessibility_pass"],
  },
  { key: "apply_feedback", stage: "revision", estimatedMinutes: 240 },
  {
    key: "deploy_production",
    stage: "deployment",
    estimatedMinutes: 60,
    priority: "high",
  },
  {
    key: "handover",
    stage: "launch",
    estimatedMinutes: 45,
    responsibleRole: "project_manager",
    dependsOn: ["deploy_production"],
  },
];

const BUILD_MILESTONES = [
  { key: "scope_confirmed", stage: "brief" },
  { key: "design_ready", stage: "design" },
  { key: "feature_complete", stage: "development" },
  { key: "preview_ready", stage: "customer_review" },
  { key: "launched", stage: "launch" },
] as const;

const BUILD_WORKFLOW: ProductionWorkflow = {
  id: "standard-build",
  stages: BUILD_STAGES,
  tasks: BUILD_TASKS,
  milestones: BUILD_MILESTONES,
};

/* -------------------------------------------------------------------------
 * A lighter workflow for products with no design or deployment phase
 * ---------------------------------------------------------------------- */

const DELIVERY_STAGES: readonly ProductionStage[] = [
  { id: "brief", responsibleRole: "project_manager", weight: 0.15, gate: "scope" },
  { id: "development", responsibleRole: "developer", weight: 0.5 },
  { id: "qa", responsibleRole: "developer", weight: 0.15 },
  {
    id: "customer_review",
    responsibleRole: "customer",
    weight: 0.1,
    awaitsCustomer: true,
    gate: "preview",
  },
  { id: "revision", responsibleRole: "developer", weight: 0.05, optional: true },
  { id: "launch", responsibleRole: "project_manager", weight: 0.05 },
];

const DELIVERY_WORKFLOW: ProductionWorkflow = {
  id: "standard-delivery",
  stages: DELIVERY_STAGES,
  tasks: [
    { key: "confirm_scope", stage: "brief", estimatedMinutes: 45, priority: "high" },
    {
      key: "implement",
      stage: "development",
      estimatedMinutes: 480,
      dependsOn: ["confirm_scope"],
    },
    { key: "test_pass", stage: "qa", estimatedMinutes: 120, dependsOn: ["implement"] },
    {
      key: "share_result",
      stage: "customer_review",
      estimatedMinutes: 30,
      responsibleRole: "developer",
      dependsOn: ["test_pass"],
    },
    { key: "apply_feedback", stage: "revision", estimatedMinutes: 120 },
    {
      key: "handover",
      stage: "launch",
      estimatedMinutes: 30,
      responsibleRole: "project_manager",
    },
  ],
  milestones: [
    { key: "scope_confirmed", stage: "brief" },
    { key: "feature_complete", stage: "development" },
    { key: "launched", stage: "launch" },
  ],
};

/* -------------------------------------------------------------------------
 * Selection
 * ---------------------------------------------------------------------- */

const WORKFLOW_BY_PRODUCT: Record<ProductType, ProductionWorkflow> = {
  build: BUILD_WORKFLOW,
  design_service: DELIVERY_WORKFLOW,
  maintenance_plan: DELIVERY_WORKFLOW,
  build_credit: DELIVERY_WORKFLOW,
  automation: DELIVERY_WORKFLOW,
  business_product: BUILD_WORKFLOW,
};

export function workflowFor(productType: ProductType): ProductionWorkflow {
  return WORKFLOW_BY_PRODUCT[productType];
}

export function stageFor(
  workflow: ProductionWorkflow,
  stageId: ProductionStageId,
): ProductionStage | undefined {
  return workflow.stages.find((stage) => stage.id === stageId);
}

export function stageIndex(
  workflow: ProductionWorkflow,
  stageId: ProductionStageId,
): number {
  return workflow.stages.findIndex((stage) => stage.id === stageId);
}

/**
 * The share of a workflow that counts against the guaranteed clock.
 *
 * Customer-facing stages are excluded, because the countdown does not run
 * while we are waiting for a reply. Charging that time against ourselves would
 * mean a customer who takes a week to review could trigger our own refund.
 */
export function chargeableWeight(workflow: ProductionWorkflow): number {
  return workflow.stages
    .filter((stage) => !stage.awaitsCustomer)
    .reduce((total, stage) => total + stage.weight, 0);
}
