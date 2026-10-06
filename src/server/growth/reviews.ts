import "server-only";

import { and, desc, eq, isNotNull } from "drizzle-orm";

import { db } from "@/db/client";
import { projects, reviews, users, type Review } from "@/db/schema";
import { PUBLIC_REVIEW_LIMIT } from "@/config/growth";
import { ApiError } from "@/lib/api/response";
import { canReview, validateReviewContent, type ReviewRefusal } from "@/lib/growth/fraud";
import { logger } from "@/lib/logger";
import type { AuthContext } from "@/server/auth";
import { recordAudit } from "@/server/admin/audit";

/**
 * Reviews.
 *
 * The anti-fake-review design is structural rather than editorial. A review
 * row is created by the platform as an **invitation** against a project that
 * actually launched, and only the person who paid for that project can answer
 * it. One project, one review, enforced by a unique index. Together those
 * facts mean a review cannot exist without a delivery behind it, and a
 * customer cannot bury their own earlier review by writing a second.
 *
 * Moderation can reject but cannot edit. Publishing somebody's words with
 * changes they did not make is worse than not publishing them -- and a
 * platform that edits its reviews has no reviews, only marketing copy.
 */

export type ReviewResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: ReviewRefusal | "not_found" | "wrong_state" };

/**
 * Invites the customer of a delivered project to review it.
 *
 * Idempotent: a second invitation for the same project returns the first. The
 * unique index means it could not create a second anyway, and an error here
 * would make a harmless retry look like a failure.
 */
export async function inviteReview(
  projectId: string,
  context: AuthContext,
): Promise<ReviewResult<Review>> {
  // Requesting a review is part of running a build, so it rides on the same
  // permission that moves a project through its stages.
  if (!context.can("build:execute")) {
    throw new ApiError("not_found", "Not found.");
  }

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
  if (!project) return { ok: false, reason: "not_found" };
  if (!project.launchedAt) return { ok: false, reason: "not_delivered" };

  const existing = await db.query.reviews.findFirst({
    where: eq(reviews.projectId, projectId),
  });
  if (existing) return { ok: true, value: existing };

  const [created] = await db
    .insert(reviews)
    .values({
      projectId,
      authorUserId: project.ownerId,
      status: "invited",
    })
    .returning();

  if (!created) throw new ApiError("internal_error", "That invitation was not saved.");

  logger.info("review invited", { projectId, reference: project.reference });
  return { ok: true, value: created };
}

/**
 * Submits a review.
 *
 * Every eligibility rule is re-checked here against the database, not taken
 * from whatever the form believed. The author is the session's own id; there
 * is no parameter through which a caller could write a review as somebody
 * else.
 */
export async function submitReview(
  input: {
    projectId: string;
    rating: number;
    body: string;
    displayName?: string | null;
    consentToPublish: boolean;
  },
  context: AuthContext,
): Promise<ReviewResult<Review>> {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, input.projectId),
  });
  if (!project) throw new ApiError("not_found", "Not found.");

  const existing = await db.query.reviews.findFirst({
    where: eq(reviews.projectId, input.projectId),
  });

  const refusal = canReview({
    projectLaunchedAt: project.launchedAt,
    projectOwnerId: project.ownerId,
    authorUserId: context.user.id,
    // An unanswered invitation is not an existing review; a submitted one is.
    alreadyExists: existing !== undefined && existing.status !== "invited",
  });
  if (refusal) return { ok: false, reason: refusal };

  const contentRefusal = validateReviewContent(input.rating, input.body);
  if (contentRefusal) return { ok: false, reason: contentRefusal };

  const now = new Date();
  const values = {
    status: "submitted" as const,
    rating: input.rating,
    body: input.body.trim(),
    // Only kept when they agreed to be named; otherwise discarded rather than
    // stored for a later change of policy.
    authorDisplayName: input.consentToPublish ? input.displayName?.trim() || null : null,
    consentToPublish: input.consentToPublish,
    submittedAt: now,
    updatedAt: now,
  };

  const [saved] = existing
    ? await db.update(reviews).set(values).where(eq(reviews.id, existing.id)).returning()
    : await db
        .insert(reviews)
        .values({
          projectId: input.projectId,
          authorUserId: context.user.id,
          ...values,
        })
        .returning();

  if (!saved) throw new ApiError("internal_error", "That review was not saved.");

  logger.info("review submitted", { projectId: input.projectId, rating: input.rating });
  return { ok: true, value: saved };
}

/** The customer's own review of a project, if there is one. */
export async function reviewForProject(
  projectId: string,
  context: AuthContext,
): Promise<Review | undefined> {
  const canReadAll = context.can("project:read:all");

  return db.query.reviews.findFirst({
    where: canReadAll
      ? eq(reviews.projectId, projectId)
      : and(eq(reviews.projectId, projectId), eq(reviews.authorUserId, context.user.id)),
  });
}

/* -------------------------------------------------------------------------
 * Moderation
 * ---------------------------------------------------------------------- */

function requireModeration(context: AuthContext): void {
  // Reviews are public-facing content about delivered work, so moderation
  // rides on the permission that already governs customer-facing records.
  if (!context.can("customer:read")) {
    throw new ApiError("not_found", "Not found.");
  }
}

export type ModerationRefusal =
  "not_found" | "wrong_state" | "note_required" | "no_consent";

/**
 * Approves a review, optionally publishing it.
 *
 * Publishing is separate from approving on purpose: a review can be perfectly
 * genuine and still not be the one to lead with this month. Collapsing them
 * would mean the only way to take something off the page is to reject it,
 * which misstates why it is gone.
 *
 * A review is never published under a name the customer did not consent to.
 * The database refuses it too.
 */
export async function approveReview(
  reviewId: string,
  publish: boolean,
  context: AuthContext,
): Promise<{ ok: boolean; reason?: ModerationRefusal }> {
  requireModeration(context);

  const review = await db.query.reviews.findFirst({ where: eq(reviews.id, reviewId) });
  if (!review) return { ok: false, reason: "not_found" };
  if (review.status === "withdrawn") return { ok: false, reason: "wrong_state" };
  if (review.status === "invited") return { ok: false, reason: "wrong_state" };

  const now = new Date();

  await db
    .update(reviews)
    .set({
      status: "approved",
      moderatedByUserId: context.user.id,
      moderatedAt: now,
      moderationNote: null,
      publishedAt: publish ? now : null,
      updatedAt: now,
    })
    .where(eq(reviews.id, reviewId));

  await recordAudit({
    category: "configuration",
    action: publish ? "review.published" : "review.approved",
    actor: context,
    subjectType: "review",
    subjectId: reviewId,
    before: { status: review.status, published: review.publishedAt !== null },
    after: { status: "approved", published: publish },
  });

  return { ok: true };
}

/** Takes an approved review off the page without rejecting it. */
export async function unpublishReview(
  reviewId: string,
  context: AuthContext,
): Promise<{ ok: boolean; reason?: ModerationRefusal }> {
  requireModeration(context);

  const review = await db.query.reviews.findFirst({ where: eq(reviews.id, reviewId) });
  if (!review) return { ok: false, reason: "not_found" };

  await db
    .update(reviews)
    .set({ publishedAt: null, updatedAt: new Date() })
    .where(eq(reviews.id, reviewId));

  await recordAudit({
    category: "configuration",
    action: "review.unpublished",
    actor: context,
    subjectType: "review",
    subjectId: reviewId,
    before: { published: true },
    after: { published: false },
  });

  return { ok: true };
}

/**
 * Rejects a review.
 *
 * The note is required by the application and again by the database. Refusing
 * to publish somebody's honest words is a decision somebody has to own, and a
 * rejection with no stated reason is indistinguishable from censorship of a
 * bad score.
 */
export async function rejectReview(
  reviewId: string,
  note: string,
  context: AuthContext,
): Promise<{ ok: boolean; reason?: ModerationRefusal }> {
  requireModeration(context);

  const reason = note.trim();
  if (!reason) return { ok: false, reason: "note_required" };

  const review = await db.query.reviews.findFirst({ where: eq(reviews.id, reviewId) });
  if (!review) return { ok: false, reason: "not_found" };

  await db
    .update(reviews)
    .set({
      status: "rejected",
      moderatedByUserId: context.user.id,
      moderatedAt: new Date(),
      moderationNote: reason,
      publishedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(reviews.id, reviewId));

  await recordAudit({
    category: "configuration",
    action: "review.rejected",
    actor: context,
    subjectType: "review",
    subjectId: reviewId,
    before: { status: review.status },
    after: { status: "rejected" },
    reason,
  });

  return { ok: true };
}

/** The customer withdrawing their own words. Their review, their call. */
export async function withdrawReview(
  reviewId: string,
  context: AuthContext,
): Promise<{ ok: boolean; reason?: ModerationRefusal }> {
  const review = await db.query.reviews.findFirst({
    where: and(eq(reviews.id, reviewId), eq(reviews.authorUserId, context.user.id)),
  });
  if (!review) throw new ApiError("not_found", "Not found.");

  await db
    .update(reviews)
    .set({ status: "withdrawn", publishedAt: null, updatedAt: new Date() })
    .where(eq(reviews.id, reviewId));

  return { ok: true };
}

/* -------------------------------------------------------------------------
 * Reading
 * ---------------------------------------------------------------------- */

export interface PublicReview {
  id: string;
  rating: number;
  body: string;
  /** Null when the customer chose not to be named. */
  authorName: string | null;
  publishedAt: Date;
}

/**
 * Reviews for the public page.
 *
 * Selects only the columns the world may see. The alternative -- selecting the
 * row and trusting the component not to render the rest -- puts a customer's
 * identity one careless JSX edit away from being published.
 */
export async function publishedReviews(
  limit: number = PUBLIC_REVIEW_LIMIT,
): Promise<PublicReview[]> {
  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      body: reviews.body,
      authorDisplayName: reviews.authorDisplayName,
      consentToPublish: reviews.consentToPublish,
      publishedAt: reviews.publishedAt,
    })
    .from(reviews)
    .where(and(eq(reviews.status, "approved"), isNotNull(reviews.publishedAt)))
    .orderBy(desc(reviews.publishedAt))
    .limit(limit);

  return rows.flatMap((row) =>
    row.rating === null || row.body === null || row.publishedAt === null
      ? []
      : [
          {
            id: row.id,
            rating: row.rating,
            body: row.body,
            // Checked again at the point of rendering, not only at the point
            // of writing: consent withdrawn later must take the name with it.
            authorName: row.consentToPublish ? row.authorDisplayName : null,
            publishedAt: row.publishedAt,
          },
        ],
  );
}

export interface ModerationRow {
  review: Review;
  projectReference: string;
  authorEmail: string;
}

/** The moderation queue. Staff-only, and it does show who wrote what. */
export async function reviewQueue(context: AuthContext): Promise<ModerationRow[]> {
  requireModeration(context);

  const rows = await db
    .select({
      review: reviews,
      projectReference: projects.reference,
      authorEmail: users.email,
    })
    .from(reviews)
    .innerJoin(projects, eq(projects.id, reviews.projectId))
    .innerJoin(users, eq(users.id, reviews.authorUserId))
    .orderBy(desc(reviews.submittedAt));

  return rows;
}
