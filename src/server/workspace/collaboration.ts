import "server-only";

import { and, eq, sql } from "drizzle-orm";

import type { NotificationKind } from "@/config/notifications";
import { APPROVAL_KINDS, type ApprovalKind } from "@/config/workspace";
import { db } from "@/db/client";
import {
  changeRequests,
  projectApprovals,
  projectEvents,
  projectMembers,
  projectMessages,
  projects,
  type ChangeRequest,
  type Project,
  type ProjectApproval,
  type ProjectMessage,
} from "@/db/schema";
import { ApiError } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import { outboundOrigin } from "@/lib/site-origin";
import type { AuthContext } from "@/server/auth";
import { notify } from "@/server/notifications";

/**
 * Collaboration inside a Build Room: messages, change requests, approvals.
 *
 * Every function here starts by establishing that the caller may touch this
 * project at all, through `assertParticipant`. That check is deliberately not
 * a parameter or a flag -- it is the first statement of each function, so
 * adding a new action without it is visibly wrong in review.
 */

export interface Participant {
  project: typeof projects.$inferSelect;
  isOwner: boolean;
  isStaff: boolean;
}

/**
 * Confirms the caller may participate in this project, and says in what
 * capacity.
 *
 * Customers reach only their own projects; staff with `project:read:all` reach
 * any. Anything else is `not_found`, not `forbidden`.
 */
export async function assertParticipant(
  projectId: string,
  context: AuthContext,
): Promise<Participant> {
  const isStaff = context.can("project:read:all");

  const project = await db.query.projects.findFirst({
    where: isStaff
      ? eq(projects.id, projectId)
      : and(eq(projects.id, projectId), eq(projects.ownerId, context.user.id)),
  });

  if (!project) throw new ApiError("not_found", "Not found.");

  return { project, isOwner: project.ownerId === context.user.id, isStaff };
}

async function recordEvent(
  projectId: string,
  type: string,
  context: AuthContext,
  isStaff: boolean,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(projectEvents).values({
    projectId,
    type,
    actorType: isStaff ? "staff" : "customer",
    actorId: context.user.clerkUserId,
    payload,
  });
}

/* -------------------------------------------------------------------------
 * Messages
 * ---------------------------------------------------------------------- */

export async function sendMessage(
  projectId: string,
  body: string,
  context: AuthContext,
  attachmentFileIds: string[] = [],
): Promise<ProjectMessage> {
  const { project, isStaff } = await assertParticipant(projectId, context);

  const trimmed = body.trim();
  if (trimmed === "") throw new ApiError("bad_request", "A message cannot be empty.");
  if (trimmed.length > 5000) {
    throw new ApiError("bad_request", "That message is too long.");
  }

  const [message] = await db
    .insert(projectMessages)
    .values({
      projectId,
      authorUserId: context.user.id,
      authorType: isStaff ? "staff" : "customer",
      // Copied, so a thread still reads correctly after someone leaves.
      authorName: context.user.displayName ?? context.user.email,
      body: trimmed,
      attachmentFileIds,
    })
    .returning();

  if (!message) throw new Error("Message insert returned no row.");

  await recordEvent(projectId, "message.posted", context, isStaff, {
    messageId: message.id,
    attachments: attachmentFileIds.length,
  });

  /**
   * Only the customer is notified, and only when staff wrote the message.
   *
   * The reverse direction has no single recipient -- staff is a team, not a
   * person -- and would need a queue surface rather than a notification. A
   * customer's message already appears in the build queue, which is where
   * staff work from.
   *
   * No dedupe key: every message is a distinct event, and two messages a
   * minute apart are two things the customer needs to know about.
   */
  if (isStaff) {
    await notifyParticipant(project, "message_received", {
      sender: message.authorName,
    });
  }

  // The author has, by definition, read their own message.
  await db
    .update(projectMembers)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, context.user.id),
      ),
    );

  return message;
}

/* -------------------------------------------------------------------------
 * Change requests
 * ---------------------------------------------------------------------- */

export interface ChangeRequestInput {
  title: string;
  description: string;
  attachmentFileIds?: string[];
}

/**
 * Raises a change request.
 *
 * Opens in `submitted` with **no** scope or price impact set. Those are filled
 * in by whoever assesses it, because a customer naming their own price impact
 * is not a change request, it is a negotiation -- and because the fixed-price
 * promise depends on changes being priced by the same engine that priced the
 * original scope.
 */
export async function requestChange(
  projectId: string,
  input: ChangeRequestInput,
  context: AuthContext,
): Promise<ChangeRequest> {
  const { isStaff } = await assertParticipant(projectId, context);

  const title = input.title.trim();
  const description = input.description.trim();

  if (title === "" || description === "") {
    throw new ApiError(
      "bad_request",
      "A change request needs a title and a description.",
    );
  }
  if (title.length > 160 || description.length > 5000) {
    throw new ApiError("bad_request", "That change request is too long.");
  }

  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(changeRequests)
    .where(eq(changeRequests.projectId, projectId));

  const [created] = await db
    .insert(changeRequests)
    .values({
      projectId,
      reference: `CR-${projectId.slice(0, 8)}-${String(count + 1).padStart(3, "0")}`,
      requestedByUserId: context.user.id,
      title,
      description,
      attachmentFileIds: input.attachmentFileIds ?? [],
      status: "submitted",
    })
    .returning();

  if (!created) throw new Error("Change request insert returned no row.");

  await recordEvent(projectId, "change.requested", context, isStaff, {
    changeRequestId: created.id,
    reference: created.reference,
  });

  logger.info("change requested", { projectId, reference: created.reference });
  return created;
}

/**
 * Records a decision on a change request.
 *
 * A customer may approve or reject one that has been quoted; staff may move it
 * through the earlier states. Approving a change that carries a price impact
 * does not itself collect the money -- an order is raised for that, which is
 * why `orderId` exists on the row.
 */
export async function decideChangeRequest(
  changeRequestId: string,
  decision: "approved" | "rejected" | "withdrawn",
  context: AuthContext,
  note?: string,
): Promise<ChangeRequest> {
  const existing = await db.query.changeRequests.findFirst({
    where: eq(changeRequests.id, changeRequestId),
  });
  if (!existing) throw new ApiError("not_found", "Not found.");

  const { isOwner, isStaff } = await assertParticipant(existing.projectId, context);

  // A customer can accept or drop their own request; moving it through review
  // and pricing is staff work.
  if (!isStaff && !isOwner) throw new ApiError("not_found", "Not found.");
  if (!isStaff && decision === "approved" && existing.status !== "quoted") {
    throw new ApiError("conflict", "This change has not been quoted yet.");
  }

  const now = new Date();
  const [updated] = await db
    .update(changeRequests)
    .set({
      status: decision,
      decidedByUserId: context.user.id,
      decidedAt: now,
      decisionNote: note ?? null,
      updatedAt: now,
    })
    .where(eq(changeRequests.id, changeRequestId))
    .returning();

  if (!updated) throw new Error("Change request update returned no row.");

  await recordEvent(existing.projectId, `change.${decision}`, context, isStaff, {
    changeRequestId,
    reference: existing.reference,
    priceImpactMinorUnits: existing.priceImpactMinorUnits,
    additionalDays: existing.additionalDays,
  });

  return updated;
}

/* -------------------------------------------------------------------------
 * Approvals
 * ---------------------------------------------------------------------- */

export function isApprovalKind(value: string): value is ApprovalKind {
  return (APPROVAL_KINDS as readonly string[]).includes(value);
}

/**
 * Asks the customer to sign something off.
 *
 * Each request is a new round rather than a reopened row, so "approved, then
 * we changed it, then approved again" stays legible on the timeline instead of
 * being flattened into one ambiguous record.
 */
export async function requestApproval(
  projectId: string,
  kind: ApprovalKind,
  context: AuthContext,
  options: { subjectRef?: string; summary?: string } = {},
): Promise<ProjectApproval> {
  const { project, isStaff } = await assertParticipant(projectId, context);
  if (!isStaff) throw new ApiError("not_found", "Not found.");

  const [{ rounds } = { rounds: 0 }] = await db
    .select({ rounds: sql<number>`count(*)::int` })
    .from(projectApprovals)
    .where(
      and(eq(projectApprovals.projectId, projectId), eq(projectApprovals.kind, kind)),
    );

  const [created] = await db
    .insert(projectApprovals)
    .values({
      projectId,
      kind,
      round: rounds + 1,
      status: "pending",
      subjectRef: options.subjectRef ?? null,
      summary: options.summary ?? null,
    })
    .returning();

  if (!created) throw new Error("Approval insert returned no row.");

  await recordEvent(projectId, `approval.${kind}.requested`, context, true, {
    approvalId: created.id,
    round: created.round,
  });

  // Keyed on the approval, not the project: a second round is a new thing to
  // approve and must notify again.
  await notifyParticipant(
    project,
    "approval_requested",
    { reference: project.reference },
    `approval_requested:${created.id}`,
  );

  return created;
}

/**
 * Records the customer's decision.
 *
 * Only the owner decides. Staff approving on a customer's behalf would make
 * every approval on the timeline worthless as evidence, which is the one thing
 * approvals are for.
 */
export async function decideApproval(
  approvalId: string,
  decision: "approved" | "changes_requested",
  context: AuthContext,
  note?: string,
): Promise<ProjectApproval> {
  const existing = await db.query.projectApprovals.findFirst({
    where: eq(projectApprovals.id, approvalId),
  });
  if (!existing) throw new ApiError("not_found", "Not found.");

  const { isOwner } = await assertParticipant(existing.projectId, context);
  if (!isOwner) throw new ApiError("not_found", "Not found.");

  if (existing.status !== "pending") {
    throw new ApiError("conflict", "This has already been decided.");
  }

  const now = new Date();
  const [updated] = await db
    .update(projectApprovals)
    .set({
      status: decision,
      decidedByUserId: context.user.id,
      decidedAt: now,
      note: note ?? null,
    })
    // Conditional on it still being pending, so two taps produce one decision.
    .where(
      and(eq(projectApprovals.id, approvalId), eq(projectApprovals.status, "pending")),
    )
    .returning();

  if (!updated) throw new ApiError("conflict", "This has already been decided.");

  await recordEvent(
    existing.projectId,
    `approval.${existing.kind}.${decision}`,
    context,
    false,
    {
      approvalId,
      round: existing.round,
    },
  );

  logger.info("approval decided", { approvalId, kind: existing.kind, decision });
  return updated;
}

/**
 * Notifies a project's owner in their own language.
 *
 * Failures are swallowed: a message that was posted and stored must not be
 * reported as failed because the recipient could not be told about it. The
 * message is on the thread either way.
 */
async function notifyParticipant(
  project: Project,
  kind: NotificationKind,
  params: Record<string, string>,
  dedupeKey: string | null = null,
): Promise<void> {
  try {
    await notify({
      recipientId: project.ownerId,
      kind,
      params,
      projectId: project.id,
      dedupeKey,
      path: `/projects/${project.reference}`,
      origin: outboundOrigin(),
    });
  } catch (error) {
    logger.error("notification failed after a collaboration write", {
      projectId: project.id,
      kind,
      error,
    });
  }
}
