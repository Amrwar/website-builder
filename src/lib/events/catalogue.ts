/**
 * The domain event catalogue.
 *
 * Every event the platform emits, with a typed payload and a version. This is
 * the contract future automation reads against, so two properties matter more
 * than convenience:
 *
 *  1. **Names are stable.** An event name is a published interface. Renaming
 *     one breaks every consumer that ever subscribed, so names are added, not
 *     changed.
 *  2. **Payloads are versioned.** A consumer written today must be able to
 *     tell whether it understands what it has been handed. Adding a field is
 *     a minor change; removing or re-typing one is a new version.
 *
 * Events are facts in the past tense: `build.started`, not `start.build`. They
 * describe what happened, never what should happen next -- that is a
 * subscriber's decision, which is what makes them safe to add consumers to.
 */

export const EVENT_PAYLOAD_VERSION = 1;

/* -------------------------------------------------------------------------
 * Payloads
 * ---------------------------------------------------------------------- */

export interface DomainEventPayloads {
  /* --- Commerce --------------------------------------------------------- */
  "order.fulfilled": {
    orderId: string;
    orderNumber: string;
    invoiceNumber: string;
    providerReference: string;
    /** Always false here. Payment does not start the guarantee. */
    guaranteeStarted: false;
  };

  /* --- Guarantee lifecycle --------------------------------------------- */
  "assets.submitted": {
    fileCount: number;
    guaranteeStarted: false;
  };
  "build.started": {
    guaranteedDays: number;
    startedAt: string;
    deadlineAt: string | null;
    /** The one event in the system where this is true. */
    guaranteeStarted: true;
  };
  "preview.published": Record<string, never>;
  "deadline.missed": {
    deadlineAt: string;
    detectedAt: string;
    workingDaysOverdue: number;
  };

  /* --- Production ------------------------------------------------------- */
  "plan.created": { workflowId: string; taskCount: number; milestoneCount: number };
  "task.assigned": { taskId: string; taskKey: string; assigneeId: string | null };
  "task.started": { taskId: string; taskKey: string };
  "task.blocked": { taskId: string; taskKey: string; reason: string };
  "task.unblocked": { taskId: string; taskKey: string; blockedMinutes: number };
  "task.completed": {
    taskId: string;
    taskKey: string;
    estimatedMinutes: number;
    actualMinutes: number | null;
  };
  "milestone.reached": { milestoneId: string; milestoneKey: string };
  "stage.entered": { stage: string };
  "risk.changed": {
    from: string;
    to: string;
    reasons: string[];
    rulesetVersion: string;
  };

  /* --- Collaboration ---------------------------------------------------- */
  "message.posted": { messageId: string; attachments: number };
  "file.uploaded": { fileId: string; name: string; version: number };
  "change.requested": { changeRequestId: string; reference: string };
  "change.approved": {
    changeRequestId: string;
    reference: string;
    priceImpactMinorUnits: number | null;
    additionalDays: number | null;
  };
  "change.rejected": {
    changeRequestId: string;
    reference: string;
    priceImpactMinorUnits: number | null;
    additionalDays: number | null;
  };
  "change.withdrawn": {
    changeRequestId: string;
    reference: string;
    priceImpactMinorUnits: number | null;
    additionalDays: number | null;
  };

  /* --- Deployment ------------------------------------------------------- */
  "deployment.started": { deploymentId: string; environment: string; version: string };
  "deployment.completed": {
    deploymentId: string;
    environment: string;
    version: string;
    url: string | null;
  };
  "deployment.failed": { deploymentId: string; environment: string; reason: string };
  "deployment.rolled_back": {
    deploymentId: string;
    /** The deployment being restored. */
    restoredDeploymentId: string;
    environment: string;
    toVersion: string;
  };

  /* --- Launch and hosting ----------------------------------------------- */
  "launch.completed": {
    launchedAt: string;
    productionUrl: string | null;
    domain: string | null;
  };
  "domain.verified": { domain: string };
  "domain.dns_configured": { domain: string };
  "domain.ssl_issued": { domain: string; expiresAt: string | null };
  "hosting.activated": { planKey: string | null; provider: string | null };
  "hosting.suspended": { reason: string };

  /* --- Subscriptions ----------------------------------------------------- */
  "subscription.started": {
    subscriptionId: string;
    reference: string;
    planKey: string;
    trialEndsAt: string | null;
  };
  "subscription.changed": {
    subscriptionId: string;
    fromPlanKey: string;
    toPlanKey: string;
    kind: "upgrade" | "downgrade" | "same";
    effectiveAt: string;
  };
  "subscription.cancelled": {
    subscriptionId: string;
    /** Service continues to this moment: a paid period is never cut short. */
    effectiveAt: string;
    reason: string | null;
  };
  "subscription.renewed": {
    subscriptionId: string;
    periodStart: string;
    periodEnd: string;
  };
  "subscription.past_due": { subscriptionId: string; since: string };

  /* --- Build credit ------------------------------------------------------ */
  "credit.granted": { minutes: number; balanceAfter: number; reason: string | null };
  "credit.spent": { minutes: number; balanceAfter: number; subjectId: string | null };
}

export type DomainEventName = keyof DomainEventPayloads;

export const DOMAIN_EVENT_NAMES = [
  "order.fulfilled",
  "assets.submitted",
  "build.started",
  "preview.published",
  "deadline.missed",
  "plan.created",
  "task.assigned",
  "task.started",
  "task.blocked",
  "task.unblocked",
  "task.completed",
  "milestone.reached",
  "stage.entered",
  "risk.changed",
  "message.posted",
  "file.uploaded",
  "change.requested",
  "change.approved",
  "change.rejected",
  "change.withdrawn",
  "deployment.started",
  "deployment.completed",
  "deployment.failed",
  "deployment.rolled_back",
  "launch.completed",
  "domain.verified",
  "domain.dns_configured",
  "domain.ssl_issued",
  "hosting.activated",
  "hosting.suspended",
  "subscription.started",
  "subscription.changed",
  "subscription.cancelled",
  "subscription.renewed",
  "subscription.past_due",
  "credit.granted",
  "credit.spent",
] as const satisfies readonly DomainEventName[];

export function isDomainEventName(value: string): value is DomainEventName {
  return (DOMAIN_EVENT_NAMES as readonly string[]).includes(value);
}

/* -------------------------------------------------------------------------
 * The envelope
 * ---------------------------------------------------------------------- */

export interface DomainEvent<N extends DomainEventName = DomainEventName> {
  name: N;
  projectId: string;
  payload: DomainEventPayloads[N];
  actorType: "customer" | "staff" | "system";
  /** Clerk user id, or null for system events. */
  actorId: string | null;
  occurredAt: Date;
  /** Payload shape version, so a consumer can tell what it is reading. */
  version: number;
}

/**
 * A subscriber.
 *
 * Synchronous today. The signature is async and returns void so that moving
 * dispatch onto a queue later is a change inside `emit`, not a change to every
 * handler ever written.
 */
export type EventHandler<N extends DomainEventName = DomainEventName> = (
  event: DomainEvent<N>,
) => Promise<void>;

/**
 * Events that must never be emitted by anything a customer can reach.
 *
 * `build.started` is the guarantee itself; `deadline.missed` triggers a refund
 * conversation. Both are system or staff facts, and the emitter enforces it.
 */
export const PRIVILEGED_EVENTS: readonly DomainEventName[] = [
  "build.started",
  "deadline.missed",
  "risk.changed",
  // A launch is our assertion that a site is live and a deployment is the
  // provider's. Neither is a thing a customer-triggered request may claim.
  "launch.completed",
  "deployment.completed",
  "deployment.rolled_back",
  "credit.granted",
];
