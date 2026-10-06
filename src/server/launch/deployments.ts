import "server-only";

import { and, desc, eq, isNotNull, ne } from "drizzle-orm";

import { db } from "@/db/client";
import { deployments, type Deployment } from "@/db/schema";
import type { DeploymentEnvironment } from "@/db/schema/enums";
import { HOSTING_PROVIDER } from "@/config/launch";
import { ApiError } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import type { AuthContext } from "@/server/auth";
import { emit } from "@/server/events/bus";

/**
 * Deployments.
 *
 * One rule governs this file, and the brief stated it plainly:
 *
 *   **Do not pretend a deployment succeeded if the provider has not confirmed
 *   it.**
 *
 * So `recordDeployment` creates a row in `building` and nothing else. Nothing
 * in the application can move a deployment to `ready`; only `confirmDeployment`
 * can, and it refuses without a provider deployment id and a confirmation
 * timestamp that came from the provider. A database CHECK enforces the same
 * rule beneath us, so a future code path cannot quietly take the shortcut.
 *
 * This matters more than it looks. "Your site is live" is a claim a customer
 * will act on -- they will send the link to their own customers -- and being
 * wrong about it is worse than being slow.
 */

export type DeployRefusal =
  "not_found" | "already_confirmed" | "not_confirmable" | "nothing_to_roll_back";

export type DeployResult<T> =
  { ok: true; value: T } | { ok: false; reason: DeployRefusal };

/**
 * Records that a deployment has been started.
 *
 * Deliberately has no parameter for a successful state. The only states
 * reachable here are `queued` and `building`, because at the moment of writing
 * this row nothing about the outcome is known.
 */
export async function recordDeployment(
  input: {
    projectId: string;
    environment: DeploymentEnvironment;
    version: string;
    commitRef?: string | null;
    note?: string | null;
    providerDeploymentId?: string | null;
  },
  context: AuthContext,
): Promise<DeployResult<Deployment>> {
  if (!context.can("build:execute")) {
    throw new ApiError("not_found", "Not found.");
  }

  const [created] = await db
    .insert(deployments)
    .values({
      projectId: input.projectId,
      environment: input.environment,
      state: "building",
      version: input.version,
      commitRef: input.commitRef ?? null,
      note: input.note ?? null,
      provider: HOSTING_PROVIDER,
      providerDeploymentId: input.providerDeploymentId ?? null,
      triggeredByUserId: context.user.id,
    })
    .returning();

  if (!created) throw new ApiError("internal_error", "That deployment was not saved.");

  await emit({
    name: "deployment.started",
    projectId: input.projectId,
    actorType: "staff",
    actorId: context.user.id,
    payload: {
      deploymentId: created.id,
      environment: input.environment,
      version: input.version,
    },
  });

  return { ok: true, value: created };
}

/**
 * Marks a deployment ready, on the provider's word.
 *
 * `confirmedAt` is the provider's timestamp, not ours, and `providerDeploymentId`
 * is required: a confirmation that cannot be traced back to a specific
 * deployment at the provider is not a confirmation, it is an assumption with a
 * date on it.
 *
 * Earlier deployments to the same environment become `superseded` in the same
 * transaction, so "what is live" is answerable by a single query rather than
 * by comparing timestamps and hoping.
 */
export async function confirmDeployment(
  input: {
    deploymentId: string;
    providerDeploymentId: string;
    url: string;
    confirmedAt: Date;
  },
  context: AuthContext,
): Promise<DeployResult<Deployment>> {
  if (!context.can("build:execute")) {
    throw new ApiError("not_found", "Not found.");
  }

  if (!input.providerDeploymentId.trim() || !input.url.trim()) {
    return { ok: false, reason: "not_confirmable" };
  }

  const existing = await db.query.deployments.findFirst({
    where: eq(deployments.id, input.deploymentId),
  });
  if (!existing) return { ok: false, reason: "not_found" };
  if (existing.state === "ready") return { ok: false, reason: "already_confirmed" };
  if (existing.state === "failed") return { ok: false, reason: "not_confirmable" };

  const confirmed = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(deployments)
      .set({
        state: "ready",
        url: input.url,
        providerDeploymentId: input.providerDeploymentId,
        providerConfirmedAt: input.confirmedAt,
        readyAt: input.confirmedAt,
      })
      // Conditional on the state we read, so two concurrent confirmations
      // cannot both believe they were the one that landed.
      .where(and(eq(deployments.id, input.deploymentId), ne(deployments.state, "ready")))
      .returning();

    if (!row) return null;

    await tx
      .update(deployments)
      .set({ state: "superseded" })
      .where(
        and(
          eq(deployments.projectId, row.projectId),
          eq(deployments.environment, row.environment),
          eq(deployments.state, "ready"),
          ne(deployments.id, row.id),
        ),
      );

    return row;
  });

  if (!confirmed) return { ok: false, reason: "already_confirmed" };

  await emit({
    name: "deployment.completed",
    projectId: confirmed.projectId,
    actorType: "staff",
    actorId: context.user.id,
    payload: {
      deploymentId: confirmed.id,
      environment: confirmed.environment,
      version: confirmed.version,
      url: input.url,
    },
  });

  return { ok: true, value: confirmed };
}

/** Records a failure, with the reason, so a history explains itself. */
export async function failDeployment(
  deploymentId: string,
  reason: string,
  context: AuthContext,
): Promise<DeployResult<Deployment>> {
  if (!context.can("build:execute")) {
    throw new ApiError("not_found", "Not found.");
  }

  const [row] = await db
    .update(deployments)
    .set({ state: "failed", failedAt: new Date(), failureReason: reason.slice(0, 500) })
    .where(and(eq(deployments.id, deploymentId), ne(deployments.state, "ready")))
    .returning();

  if (!row) return { ok: false, reason: "not_found" };

  await emit({
    name: "deployment.failed",
    projectId: row.projectId,
    actorType: "staff",
    actorId: context.user.id,
    payload: {
      deploymentId: row.id,
      environment: row.environment,
      reason: row.failureReason ?? "",
    },
  });

  logger.warn("deployment failed", { deploymentId, projectId: row.projectId });
  return { ok: true, value: row };
}

/**
 * The deployment currently serving an environment.
 *
 * Reads `provider_confirmed_at IS NOT NULL` as well as the state. The CHECK
 * constraint already makes those equivalent; asserting it here too means a
 * dropped constraint degrades into a conservative query rather than into a
 * false claim on a customer's screen.
 */
export async function liveDeployment(
  projectId: string,
  environment: DeploymentEnvironment,
): Promise<Deployment | undefined> {
  return db.query.deployments.findFirst({
    where: and(
      eq(deployments.projectId, projectId),
      eq(deployments.environment, environment),
      eq(deployments.state, "ready"),
      isNotNull(deployments.providerConfirmedAt),
    ),
    orderBy: desc(deployments.providerConfirmedAt),
  });
}

export async function deploymentHistory(
  projectId: string,
  limit = 25,
): Promise<Deployment[]> {
  return db
    .select()
    .from(deployments)
    .where(eq(deployments.projectId, projectId))
    .orderBy(desc(deployments.createdAt))
    .limit(limit);
}

/**
 * Puts an earlier deployment back.
 *
 * A rollback is a **new deployment**, not an edit to an old one, and it starts
 * in `building` like any other. Flipping the previous row back to `ready`
 * would erase the fact that a bad release ever went out, which is exactly the
 * record somebody needs after an incident.
 */
export async function rollbackTo(
  deploymentId: string,
  context: AuthContext,
): Promise<DeployResult<Deployment>> {
  if (!context.can("build:execute")) {
    throw new ApiError("not_found", "Not found.");
  }

  const target = await db.query.deployments.findFirst({
    where: eq(deployments.id, deploymentId),
  });

  // Only something that was genuinely live can be rolled back to. A
  // deployment that never succeeded is not a safe place to return to.
  if (!target || target.state === "failed" || !target.providerConfirmedAt) {
    return { ok: false, reason: "nothing_to_roll_back" };
  }

  const [created] = await db
    .insert(deployments)
    .values({
      projectId: target.projectId,
      environment: target.environment,
      state: "building",
      version: `${target.version}-rollback`,
      commitRef: target.commitRef,
      note: `Rollback to ${target.version}`,
      provider: target.provider,
      rollbackOfDeploymentId: target.id,
      triggeredByUserId: context.user.id,
    })
    .returning();

  if (!created) throw new ApiError("internal_error", "That rollback was not saved.");

  await emit({
    name: "deployment.rolled_back",
    projectId: target.projectId,
    actorType: "staff",
    actorId: context.user.id,
    payload: {
      deploymentId: created.id,
      restoredDeploymentId: target.id,
      environment: target.environment,
      toVersion: target.version,
    },
  });

  return { ok: true, value: created };
}

/** Projects that have never had a confirmed production deployment. */
export async function hasConfirmedProduction(projectId: string): Promise<boolean> {
  const row = await liveDeployment(projectId, "production");
  return row !== undefined;
}

/** Used by the Launch Centre to show what is live without a second query. */
export async function productionUrlFor(projectId: string): Promise<string | null> {
  const row = await liveDeployment(projectId, "production");
  return row?.url ?? null;
}
