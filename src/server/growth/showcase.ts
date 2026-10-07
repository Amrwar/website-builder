import "server-only";

import { and, asc, desc, eq, isNotNull, like, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { projects, reviews, showcaseEntries, type ShowcaseEntry } from "@/db/schema";
import { BUILD_WALL_PREVIEW_LIMIT } from "@/config/growth";
import type { BuildType } from "@/config/products";
import { ApiError } from "@/lib/api/response";
import { slugify } from "@/lib/growth/codes";
import { logger } from "@/lib/logger";
import type { AuthContext } from "@/server/auth";
import { recordAudit } from "@/server/admin/audit";

/**
 * The public build wall.
 *
 * Two rules shape every function here, and they are the brief's own words:
 * show completed projects **only when authorized**, and do not expose private
 * customer information.
 *
 * Authorization is a recorded consent, not a staff opinion. `customerConsentAt`
 * and `consentGivenByUserId` are written when the customer agrees, the
 * database refuses to publish without them, and nothing publishes a customer's
 * name unless they separately agreed to be named.
 *
 * Privacy is handled by the shape of the data rather than by care at the point
 * of rendering: an entry carries its own copy of everything shown, so the
 * public query touches no customer-owned table at all. What is written here is
 * what the world sees, and it got here deliberately.
 */

/* -------------------------------------------------------------------------
 * Consent
 * ---------------------------------------------------------------------- */

export type ConsentRefusal = "not_found" | "not_launched" | "not_the_customer";

/**
 * The customer agreeing their build may be shown.
 *
 * Given by the customer themselves, scoped to the session's own id. Staff
 * cannot consent on a customer's behalf -- that is the whole point of the
 * column, and a "consent" somebody else recorded is not one.
 */
export async function giveShowcaseConsent(
  projectId: string,
  displayName: boolean,
  context: AuthContext,
): Promise<{ ok: boolean; reason?: ConsentRefusal }> {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.ownerId, context.user.id)),
  });
  // Owner-scoped in the query: somebody else's project answers the same way as
  // one that does not exist.
  if (!project) return { ok: false, reason: "not_found" };
  if (!project.launchedAt) return { ok: false, reason: "not_launched" };

  const now = new Date();
  const existing = await db.query.showcaseEntries.findFirst({
    where: eq(showcaseEntries.projectId, projectId),
  });

  if (existing) {
    await db
      .update(showcaseEntries)
      .set({
        customerConsentAt: now,
        consentGivenByUserId: context.user.id,
        displayCustomerName: displayName,
        updatedAt: now,
      })
      .where(eq(showcaseEntries.id, existing.id));
    return { ok: true };
  }

  // A draft, not a publication. Consent permits the entry to exist; somebody
  // still has to write it and publish it.
  await db.insert(showcaseEntries).values({
    projectId,
    slug: await uniqueSlug(project.reference),
    title: project.reference,
    summary: "",
    buildType: project.buildType,
    status: "draft",
    customerConsentAt: now,
    consentGivenByUserId: context.user.id,
    displayCustomerName: displayName,
  });

  logger.info("showcase consent given", { projectId });
  return { ok: true };
}

/** Withdrawing consent takes the entry off the wall immediately. */
export async function withdrawShowcaseConsent(
  projectId: string,
  context: AuthContext,
): Promise<{ ok: boolean; reason?: ConsentRefusal }> {
  const entry = await db.query.showcaseEntries.findFirst({
    where: eq(showcaseEntries.projectId, projectId),
  });
  if (!entry) return { ok: false, reason: "not_found" };

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.ownerId, context.user.id)),
  });
  if (!project) return { ok: false, reason: "not_the_customer" };

  // Retired rather than deleted, and unpublished in the same write. A customer
  // changing their mind should not have to wait for anybody.
  await db
    .update(showcaseEntries)
    .set({
      status: "retired",
      publishedAt: null,
      customerConsentAt: null,
      displayCustomerName: false,
      updatedAt: new Date(),
    })
    .where(eq(showcaseEntries.id, entry.id));

  logger.info("showcase consent withdrawn", { projectId });
  return { ok: true };
}

/* -------------------------------------------------------------------------
 * Editing
 * ---------------------------------------------------------------------- */

const entryPatch = z.object({
  title: z.string().trim().min(3).max(120),
  summary: z.string().trim().min(20).max(600),
  industry: z.string().trim().max(80).nullable(),
  technologies: z.array(z.string().trim().min(1).max(40)).max(12),
  screenshots: z.array(z.string().trim().min(1).max(500)).max(8),
  customerLabel: z.string().trim().max(120).nullable(),
  reviewId: z.string().uuid().nullable(),
  sortOrder: z.number().int().min(0).max(999),
});

function requireManage(context: AuthContext): void {
  // The build wall is public marketing about delivered work; the permission
  // that governs customer-facing records governs it.
  if (!context.can("customer:read")) {
    throw new ApiError("not_found", "Not found.");
  }
}

export async function updateShowcaseEntry(
  entryId: string,
  patch: unknown,
  context: AuthContext,
): Promise<{ ok: boolean; reason?: "not_found" | "invalid"; message?: string }> {
  requireManage(context);

  const parsed = entryPatch.safeParse(patch);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid",
      message: parsed.error.issues[0]?.message,
    };
  }

  const existing = await db.query.showcaseEntries.findFirst({
    where: eq(showcaseEntries.id, entryId),
  });
  if (!existing) return { ok: false, reason: "not_found" };

  // A quoted review has to be one that was approved and published. Quoting a
  // rejected or withdrawn review on the marketing page would republish words
  // somebody decided should not be public.
  if (parsed.data.reviewId) {
    const review = await db.query.reviews.findFirst({
      where: eq(reviews.id, parsed.data.reviewId),
    });
    if (!review || review.status !== "approved" || review.publishedAt === null) {
      return { ok: false, reason: "invalid", message: "That review is not published." };
    }
  }

  await db
    .update(showcaseEntries)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(showcaseEntries.id, entryId));

  return { ok: true };
}

export type PublishRefusal = "not_found" | "no_consent" | "incomplete";

/**
 * Publishes an entry.
 *
 * Refuses without consent, and refuses an entry with nothing in it. A build
 * wall of empty cards is worse than an empty build wall: it looks like work
 * nobody could describe.
 */
export async function publishShowcaseEntry(
  entryId: string,
  context: AuthContext,
): Promise<{ ok: boolean; reason?: PublishRefusal }> {
  requireManage(context);

  const entry = await db.query.showcaseEntries.findFirst({
    where: eq(showcaseEntries.id, entryId),
  });
  if (!entry) return { ok: false, reason: "not_found" };
  if (!entry.customerConsentAt) return { ok: false, reason: "no_consent" };
  if (entry.summary.trim().length < 20 || entry.title.trim().length < 3) {
    return { ok: false, reason: "incomplete" };
  }

  const now = new Date();
  await db
    .update(showcaseEntries)
    .set({ status: "published", publishedAt: now, updatedAt: now })
    .where(eq(showcaseEntries.id, entryId));

  await recordAudit({
    category: "configuration",
    action: "showcase.published",
    actor: context,
    subjectType: "showcase_entry",
    subjectId: entryId,
    subjectLabel: entry.title,
    after: { status: "published", slug: entry.slug },
  });

  return { ok: true };
}

export async function unpublishShowcaseEntry(
  entryId: string,
  context: AuthContext,
): Promise<{ ok: boolean; reason?: PublishRefusal }> {
  requireManage(context);

  const entry = await db.query.showcaseEntries.findFirst({
    where: eq(showcaseEntries.id, entryId),
  });
  if (!entry) return { ok: false, reason: "not_found" };

  await db
    .update(showcaseEntries)
    .set({ status: "draft", publishedAt: null, updatedAt: new Date() })
    .where(eq(showcaseEntries.id, entryId));

  await recordAudit({
    category: "configuration",
    action: "showcase.unpublished",
    actor: context,
    subjectType: "showcase_entry",
    subjectId: entryId,
    subjectLabel: entry.title,
    before: { status: "published" },
    after: { status: "draft" },
  });

  return { ok: true };
}

/**
 * A slug nobody else has, as `name`, `name-2`, `name-3`…
 *
 * One query for every taken slug that could clash, rather than a query per
 * candidate: the previous loop issued up to fifty sequential round trips for a
 * popular name. The unique index on `slug` is still what guarantees
 * uniqueness — two concurrent publishes can both see `name-2` free here — so
 * this only has to be a good first guess, and the insert is the referee.
 */
async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || "build";

  const taken = new Set(
    (
      await db
        .select({ slug: showcaseEntries.slug })
        .from(showcaseEntries)
        .where(
          or(
            eq(showcaseEntries.slug, root),
            like(showcaseEntries.slug, `${root.replace(/[%_]/g, "\\$&")}-%`),
          ),
        )
    ).map((row) => row.slug),
  );

  if (!taken.has(root)) return root;
  for (let suffix = 2; suffix <= taken.size + 2; suffix += 1) {
    const candidate = `${root}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${root}-${Date.now()}`;
}

/* -------------------------------------------------------------------------
 * Reading
 * ---------------------------------------------------------------------- */

export interface PublicShowcase {
  id: string;
  slug: string;
  title: string;
  summary: string;
  industry: string | null;
  buildType: BuildType;
  technologies: readonly string[];
  screenshots: readonly string[];
  deliveredInDays: number | null;
  /** Null unless the customer agreed to be named. */
  customerLabel: string | null;
  testimonial: { body: string; rating: number; authorName: string | null } | null;
}

/**
 * The public wall.
 *
 * Selects named columns only, and never joins to `users` or `projects`. A
 * query that cannot reach a customer's record cannot leak one, which is a
 * stronger guarantee than remembering not to render it.
 */
export async function publishedShowcase(
  limit: number = BUILD_WALL_PREVIEW_LIMIT,
): Promise<PublicShowcase[]> {
  const rows = await db
    .select({
      id: showcaseEntries.id,
      slug: showcaseEntries.slug,
      title: showcaseEntries.title,
      summary: showcaseEntries.summary,
      industry: showcaseEntries.industry,
      buildType: showcaseEntries.buildType,
      technologies: showcaseEntries.technologies,
      screenshots: showcaseEntries.screenshots,
      deliveredInDays: showcaseEntries.deliveredInDays,
      displayCustomerName: showcaseEntries.displayCustomerName,
      customerLabel: showcaseEntries.customerLabel,
      reviewBody: reviews.body,
      reviewRating: reviews.rating,
      reviewAuthor: reviews.authorDisplayName,
      reviewConsent: reviews.consentToPublish,
      reviewPublishedAt: reviews.publishedAt,
    })
    .from(showcaseEntries)
    .leftJoin(reviews, eq(reviews.id, showcaseEntries.reviewId))
    .where(
      and(
        eq(showcaseEntries.status, "published"),
        isNotNull(showcaseEntries.publishedAt),
        isNotNull(showcaseEntries.customerConsentAt),
      ),
    )
    .orderBy(asc(showcaseEntries.sortOrder), desc(showcaseEntries.publishedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    industry: row.industry,
    buildType: row.buildType,
    technologies: row.technologies,
    screenshots: row.screenshots,
    deliveredInDays: row.deliveredInDays,
    // Consent is checked again here, at the moment of reading. Consent
    // withdrawn after an entry was written must take the name with it.
    customerLabel: row.displayCustomerName ? row.customerLabel : null,
    testimonial:
      row.reviewBody && row.reviewRating && row.reviewPublishedAt
        ? {
            body: row.reviewBody,
            rating: row.reviewRating,
            authorName: row.reviewConsent ? row.reviewAuthor : null,
          }
        : null,
  }));
}

/** Everything, for the admin screen. */
export async function listShowcase(context: AuthContext): Promise<ShowcaseEntry[]> {
  requireManage(context);
  return db
    .select()
    .from(showcaseEntries)
    .orderBy(asc(showcaseEntries.sortOrder), desc(showcaseEntries.createdAt));
}

/** The customer's own consent state for one project. */
export async function consentStateFor(
  projectId: string,
): Promise<{ hasEntry: boolean; consented: boolean; published: boolean }> {
  const entry = await db.query.showcaseEntries.findFirst({
    where: eq(showcaseEntries.projectId, projectId),
  });

  return {
    hasEntry: entry !== undefined,
    consented: entry?.customerConsentAt !== null && entry !== undefined,
    published: entry?.status === "published",
  };
}
