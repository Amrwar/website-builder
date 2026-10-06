import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { projectEvents, projectFiles, projects, type Project } from "@/db/schema";
import { ApiError } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import { deadlineFrom } from "@/lib/schedule/deadline";
import type { AuthContext } from "@/server/auth";

/**
 * The project lifecycle, and the guarantee clock.
 *
 * This module exists because one rule in this product is worth more than the
 * rest put together:
 *
 *   **The countdown starts when the build officially starts, and never
 *   before.** Not at checkout, not at payment, not when assets arrive.
 *
 * Everything here is written to make breaking that rule hard. The transition
 * into `in_build` is the only place `buildStartedAt` and `deadlineAt` are ever
 * written; both are set together from one instant; and the deadline is stored
 * rather than derived, so a later change to tier durations cannot silently
 * move a commitment that has already been made.
 */

/** A transition that was refused, with the reason, for the caller to show. */
export type TransitionRefusal =
  "wrong_status" | "no_assets" | "already_started" | "no_guarantee";

export type TransitionResult<T> =
  { ok: true; value: T } | { ok: false; reason: TransitionRefusal };

async function recordEvent(
  projectId: string,
  type: string,
  actorType: "customer" | "staff" | "system",
  actorId: string | null,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(projectEvents).values({ projectId, type, actorType, actorId, payload });
}

/**
 * Confirms the customer's information and assets are in.
 *
 * Deliberately does **not** start the clock. Submitting assets and officially
 * starting the build are two events with two different actors, and collapsing
 * them would mean a customer could start their own guarantee at 2am on a
 * Sunday by dragging in a logo.
 */
export async function submitAssets(
  projectId: string,
  context: AuthContext,
): Promise<TransitionResult<Project>> {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.ownerId, context.user.id)),
  });

  // Owner-scoped in the query: a caller who does not own this gets the same
  // answer as one asking about a project that does not exist.
  if (!project) throw new ApiError("not_found", "Not found.");

  if (project.status !== "awaiting_assets") {
    return {
      ok: false,
      reason: project.buildStartedAt ? "already_started" : "wrong_status",
    };
  }

  const [uploaded] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(projectFiles)
    .where(
      and(
        eq(projectFiles.projectId, projectId),
        eq(projectFiles.kind, "customer_upload"),
      ),
    );

  // Requiring at least one file is the difference between a confirmation and a
  // claim. The build team cannot start on an empty folder.
  if (!uploaded || uploaded.count === 0) {
    return { ok: false, reason: "no_assets" };
  }

  const now = new Date();

  const [updated] = await db
    .update(projects)
    .set({ assetsSubmittedAt: now, updatedAt: now })
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.status, "awaiting_assets"),
        // Conditional on it not already being set, so a double submit does not
        // quietly move the date the customer met their obligation.
        sql`${projects.assetsSubmittedAt} is null`,
      ),
    )
    .returning();

  if (!updated) {
    const current = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });
    return current ? { ok: true, value: current } : { ok: false, reason: "wrong_status" };
  }

  await recordEvent(projectId, "assets.submitted", "customer", context.user.clerkUserId, {
    fileCount: uploaded.count,
    // Stated explicitly: this event is not the start of the guarantee.
    guaranteeStarted: false,
  });

  logger.info("assets submitted", { projectId, files: uploaded.count });
  return { ok: true, value: updated };
}

/**
 * Officially starts the build. **This is where the countdown begins.**
 *
 * Requires `build:execute`, so a customer cannot start their own guarantee.
 * Requires assets to be in, because starting the clock before we can work is
 * the company paying for its own queue.
 *
 * `buildStartedAt` and `deadlineAt` are written in the same statement from the
 * same instant, and the statement is conditional on the project still being in
 * `awaiting_assets` -- so two concurrent callers cannot produce two different
 * deadlines for one project.
 */
export async function startBuild(
  projectId: string,
  context: AuthContext,
): Promise<TransitionResult<Project>> {
  if (!context.can("build:execute")) {
    // not_found rather than forbidden: a customer probing this learns nothing.
    throw new ApiError("not_found", "Not found.");
  }

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
  if (!project) throw new ApiError("not_found", "Not found.");

  if (project.buildStartedAt) return { ok: false, reason: "already_started" };
  if (project.status !== "awaiting_assets") return { ok: false, reason: "wrong_status" };
  if (!project.assetsSubmittedAt) return { ok: false, reason: "no_assets" };
  if (!project.guaranteedDays) return { ok: false, reason: "no_guarantee" };

  const startedAt = new Date();
  const deadlineAt = deadlineFrom(startedAt, project.guaranteedDays);

  const [updated] = await db
    .update(projects)
    .set({
      status: "in_build",
      buildStartedAt: startedAt,
      deadlineAt,
      updatedAt: startedAt,
    })
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.status, "awaiting_assets"),
        sql`${projects.buildStartedAt} is null`,
      ),
    )
    .returning();

  if (!updated) return { ok: false, reason: "already_started" };

  await recordEvent(projectId, "build.started", "staff", context.user.clerkUserId, {
    guaranteedDays: project.guaranteedDays,
    startedAt: startedAt.toISOString(),
    deadlineAt: deadlineAt?.toISOString() ?? null,
    // The moment the clock starts, written into the audit trail. A disputed
    // deadline is settled against this row.
    guaranteeStarted: true,
  });

  logger.info("build started; guarantee countdown running", {
    projectId,
    deadlineAt: deadlineAt?.toISOString(),
  });

  return { ok: true, value: updated };
}

/** Moves a build into preview once there is something to look at. */
export async function publishPreview(
  projectId: string,
  context: AuthContext,
): Promise<TransitionResult<Project>> {
  if (!context.can("build:execute")) throw new ApiError("not_found", "Not found.");

  const now = new Date();
  const [updated] = await db
    .update(projects)
    .set({ status: "in_preview", deliveredAt: now, updatedAt: now })
    .where(and(eq(projects.id, projectId), eq(projects.status, "in_build")))
    .returning();

  if (!updated) return { ok: false, reason: "wrong_status" };

  await recordEvent(projectId, "preview.published", "staff", context.user.clerkUserId);
  return { ok: true, value: updated };
}
