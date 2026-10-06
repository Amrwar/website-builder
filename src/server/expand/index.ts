import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { changeRequests, projects, type Project } from "@/db/schema";
import { ApiError } from "@/lib/api/response";
import { formatMinutes } from "@/lib/credits";
import { logger } from "@/lib/logger";
import type { AuthContext } from "@/server/auth";
import { accountFor } from "@/server/credits";
import { requestChange } from "@/server/workspace/collaboration";

/**
 * Build more.
 *
 * The mechanism by which an existing customer buys more work **on the project
 * they already have**, rather than starting a new one. The distinction is the
 * whole point: a launched site that needs a booking system is not a new
 * project, and treating it as one would throw away its brief, its files, its
 * messages, its approvals and its deployment history -- everything that makes
 * the second piece of work cheaper to do than the first.
 *
 * So expansion reuses what already exists. A change request is raised against
 * the original project, priced by the same engine, and paid for either with a
 * new order or out of a build-credit balance. Nothing forks.
 */

/** A project that is far enough along to be expanded. */
const EXPANDABLE_STATUSES = [
  "in_preview",
  "awaiting_approval",
  "approved",
  "launching",
  "launched",
] as const;

export interface ExpansionOption {
  project: Project;
  /** True when more work can be ordered on this project right now. */
  available: boolean;
  /** Why not, when it is not. */
  reason: "not_started" | "cancelled" | null;
  /** Open change requests, so the customer is not asked to repeat themselves. */
  openRequests: number;
}

/**
 * What a customer could expand.
 *
 * Returns every project they own with its eligibility, rather than only the
 * eligible ones: a customer looking for the button on a project that cannot
 * take more work yet needs to be told why, not shown an empty list.
 */
export async function expansionOptionsFor(
  context: AuthContext,
): Promise<ExpansionOption[]> {
  const owned = await db
    .select()
    .from(projects)
    .where(eq(projects.ownerId, context.user.id))
    .orderBy(desc(projects.createdAt));

  if (owned.length === 0) return [];

  const open = await db
    .select({ projectId: changeRequests.projectId })
    .from(changeRequests)
    .where(
      and(
        inArray(
          changeRequests.projectId,
          owned.map((project) => project.id),
        ),
        inArray(changeRequests.status, ["submitted", "under_review", "quoted"]),
      ),
    );

  const openByProject = new Map<string, number>();
  for (const row of open) {
    openByProject.set(row.projectId, (openByProject.get(row.projectId) ?? 0) + 1);
  }

  return owned.map((project) => {
    const expandable = (EXPANDABLE_STATUSES as readonly string[]).includes(
      project.status,
    );

    return {
      project,
      available: expandable,
      reason:
        project.status === "cancelled" ? "cancelled" : expandable ? null : "not_started",
      openRequests: openByProject.get(project.id) ?? 0,
    };
  });
}

export type ExpandRefusal = "not_found" | "not_expandable" | "empty_request";

export type ExpandResult =
  | { ok: true; changeRequestId: string; reference: string }
  | { ok: false; reason: ExpandRefusal };

/**
 * Raises a request for more work on an existing project.
 *
 * Deliberately creates a **change request**, not a project. It therefore
 * inherits the project's scope assessment, its files, its conversation and its
 * approvals, and it goes through the same quote-and-approve loop that any
 * other mid-build change does -- which is the loop that already exists, is
 * already tested, and already produces a price the customer agrees to before
 * any work starts.
 *
 * No price is accepted here. The brief describes what is wanted; what it costs
 * is decided by the engine and quoted back.
 */
export async function requestMoreWork(
  input: { projectId: string; summary: string; detail: string },
  context: AuthContext,
): Promise<ExpandResult> {
  const summary = input.summary.trim();
  const detail = input.detail.trim();
  if (!summary || !detail) return { ok: false, reason: "empty_request" };

  // Owner-scoped in the query: a caller asking about somebody else's project
  // gets the same answer as one asking about a project that does not exist.
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, input.projectId), eq(projects.ownerId, context.user.id)),
  });

  if (!project) throw new ApiError("not_found", "Not found.");

  if (!(EXPANDABLE_STATUSES as readonly string[]).includes(project.status)) {
    return { ok: false, reason: "not_expandable" };
  }

  // Reuses the existing change-request flow rather than a parallel one: it is
  // already tested, already quotes through the engine, and already produces a
  // price the customer agrees to before any work starts.
  const created = await requestChange(
    project.id,
    { title: summary, description: detail },
    context,
  );

  logger.info("expansion requested", {
    projectId: project.id,
    reference: project.reference,
  });

  return {
    ok: true,
    changeRequestId: created.id,
    reference: created.reference,
  };
}

/**
 * What a customer has available to spend on more work.
 *
 * Credit is platform-level, so this is the same balance whatever project they
 * are looking at. Returned alongside the expansion options so the Build Room
 * can say "you have 2h 30m of credit" rather than sending them to a different
 * screen to find out.
 */
export async function spendableCredit(
  context: AuthContext,
): Promise<{ minutes: number; hours: number; remainder: number }> {
  const account = await accountFor(context.user.id);
  const { hours, minutes } = formatMinutes(account.balanceMinutes);
  return { minutes: account.balanceMinutes, hours, remainder: minutes };
}
