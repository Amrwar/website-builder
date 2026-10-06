"use server";

import { revalidatePath } from "next/cache";

import { ApiError } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import { getAuthContext, requireUser } from "@/server/auth";
import { applyAsAffiliate, applyAsPartner } from "@/server/growth/partners";
import {
  approveCommission,
  approvePartner,
  approveAffiliate,
  reverseCommission,
  setPartnerStatus,
} from "@/server/growth/partners";
import { clawBackReward } from "@/server/growth/referrals";
import {
  approveReview,
  inviteReview,
  rejectReview,
  submitReview,
  unpublishReview,
  withdrawReview,
} from "@/server/growth/reviews";
import {
  giveShowcaseConsent,
  publishShowcaseEntry,
  unpublishShowcaseEntry,
  updateShowcaseEntry,
  withdrawShowcaseConsent,
} from "@/server/growth/showcase";

/**
 * Growth actions.
 *
 * Every one is a public HTTP endpoint with a generated name, so every one
 * re-establishes the caller from the session and hands to a service that
 * applies its own permission. Nothing here decides authority.
 *
 * None of them accepts a reward, a commission, an author or an owner. A
 * caller can describe what they want; who they are comes from the session and
 * what anything is worth is computed server-side.
 */

export type GrowthResult<T = unknown> =
  | ({ ok: true } & (T extends object ? T : object))
  | { ok: false; reason: string; message: string };

function failure(error: unknown, fallback: string): GrowthResult<never> {
  if (error instanceof ApiError) {
    return { ok: false, reason: error.code, message: error.message };
  }
  logger.error("growth action failed", { error });
  return { ok: false, reason: "internal_error", message: fallback };
}

/* -------------------------------------------------------------------------
 * Applications
 * ---------------------------------------------------------------------- */

/**
 * Applying as a partner.
 *
 * Open to signed-out visitors: an agency's principal may never configure a
 * build themselves, and requiring an account first would turn one step into
 * two. The session is attached when there is one, so an application from a
 * signed-in user is linked to them.
 */
export async function submitPartnerApplication(input: unknown): Promise<GrowthResult> {
  try {
    const context = (await getAuthContext()) ?? undefined;
    const result = await applyAsPartner(input, context);

    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason,
        message:
          result.reason === "already_applied"
            ? "There is already an application for that email address."
            : (result.message ?? "Please check the form and try again."),
      };
    }

    return { ok: true };
  } catch (error) {
    return failure(error, "That application could not be sent.");
  }
}

export async function submitAffiliateApplication(input: unknown): Promise<GrowthResult> {
  try {
    const context = (await getAuthContext()) ?? undefined;
    const result = await applyAsAffiliate(input, context);

    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason,
        message:
          result.reason === "already_applied"
            ? "There is already an application for that email address."
            : (result.message ?? "Please check the form and try again."),
      };
    }

    return { ok: true };
  } catch (error) {
    return failure(error, "That application could not be sent.");
  }
}

/* -------------------------------------------------------------------------
 * Reviews
 * ---------------------------------------------------------------------- */

export async function sendReview(
  projectId: string,
  rating: number,
  body: string,
  displayName: string | null,
  consentToPublish: boolean,
): Promise<GrowthResult> {
  try {
    const context = await requireUser();

    const result = await submitReview(
      {
        projectId: String(projectId),
        rating: Number(rating),
        body: String(body ?? ""),
        displayName: displayName ?? null,
        consentToPublish: Boolean(consentToPublish),
      },
      context,
    );

    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason,
        message:
          result.reason === "not_delivered"
            ? "You can review a build once it is live."
            : result.reason === "already_reviewed"
              ? "You have already reviewed this build."
              : result.reason === "invalid_rating"
                ? "Choose a rating from one to five."
                : result.reason === "empty_body"
                  ? "Tell us a little about how it went."
                  : "That review could not be saved.",
      };
    }

    revalidatePath("/projects");
    return { ok: true };
  } catch (error) {
    return failure(error, "That review could not be saved.");
  }
}

/**
 * Asks the customer of a delivered project for a review.
 *
 * Staff-only, and idempotent: a second invitation returns the first rather
 * than erroring, because a retried click is not a failure. The customer can
 * also write one unprompted from their own Build Room — the invitation exists
 * so the asking is deliberate and visible, not so it is the only route.
 */
export async function requestReview(projectId: string): Promise<GrowthResult> {
  try {
    const context = await requireUser();
    const result = await inviteReview(String(projectId), context);

    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason,
        message:
          result.reason === "not_delivered"
            ? "A review can be requested once the build is live."
            : "That invitation could not be sent.",
      };
    }

    revalidatePath("/projects");
    revalidatePath("/admin/reviews");
    return { ok: true };
  } catch (error) {
    return failure(error, "That invitation could not be sent.");
  }
}

export async function retractReview(reviewId: string): Promise<GrowthResult> {
  try {
    const context = await requireUser();
    await withdrawReview(String(reviewId), context);
    revalidatePath("/projects");
    return { ok: true };
  } catch (error) {
    return failure(error, "That review could not be withdrawn.");
  }
}

export async function moderateReview(
  reviewId: string,
  decision: "approve" | "publish" | "unpublish" | "reject",
  note?: string,
): Promise<GrowthResult> {
  try {
    const context = await requireUser();

    const result =
      decision === "reject"
        ? await rejectReview(String(reviewId), String(note ?? ""), context)
        : decision === "unpublish"
          ? await unpublishReview(String(reviewId), context)
          : await approveReview(String(reviewId), decision === "publish", context);

    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason ?? "failed",
        message:
          result.reason === "note_required"
            ? "Say why this review is being rejected."
            : "That review could not be moderated.",
      };
    }

    revalidatePath("/admin/reviews");
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return failure(error, "That review could not be moderated.");
  }
}

/* -------------------------------------------------------------------------
 * The build wall
 * ---------------------------------------------------------------------- */

export async function setShowcaseConsent(
  projectId: string,
  consented: boolean,
  displayName: boolean,
): Promise<GrowthResult> {
  try {
    const context = await requireUser();

    const result = consented
      ? await giveShowcaseConsent(String(projectId), Boolean(displayName), context)
      : await withdrawShowcaseConsent(String(projectId), context);

    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason ?? "failed",
        message:
          result.reason === "not_launched"
            ? "A build can appear on the wall once it is live."
            : "That could not be saved.",
      };
    }

    revalidatePath("/projects");
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return failure(error, "That could not be saved.");
  }
}

export async function saveShowcaseEntry(
  entryId: string,
  patch: unknown,
): Promise<GrowthResult> {
  try {
    const context = await requireUser();
    const result = await updateShowcaseEntry(String(entryId), patch, context);

    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason ?? "failed",
        message: result.message ?? "That entry could not be saved.",
      };
    }

    revalidatePath("/admin/showcase");
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return failure(error, "That entry could not be saved.");
  }
}

export async function setShowcasePublished(
  entryId: string,
  published: boolean,
): Promise<GrowthResult> {
  try {
    const context = await requireUser();

    const result = published
      ? await publishShowcaseEntry(String(entryId), context)
      : await unpublishShowcaseEntry(String(entryId), context);

    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason ?? "failed",
        message:
          result.reason === "no_consent"
            ? "This build has no recorded customer consent."
            : result.reason === "incomplete"
              ? "Add a title and a summary before publishing."
              : "That entry could not be published.",
      };
    }

    revalidatePath("/admin/showcase");
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return failure(error, "That entry could not be published.");
  }
}

/* -------------------------------------------------------------------------
 * Partners, affiliates and money
 * ---------------------------------------------------------------------- */

export async function decidePartner(
  kind: "partner" | "affiliate",
  id: string,
  decision: "approve" | "suspend" | "reject",
  note?: string,
  commissionBasisPoints?: number,
): Promise<GrowthResult> {
  try {
    const context = await requireUser();

    if (decision === "approve") {
      const result =
        kind === "partner"
          ? await approvePartner(String(id), commissionBasisPoints, context)
          : await approveAffiliate(String(id), commissionBasisPoints, context);

      if (!result.ok) {
        return {
          ok: false,
          reason: result.reason,
          message: "That application could not be approved.",
        };
      }
      revalidatePath("/admin/partners");
      return { ok: true };
    }

    const result = await setPartnerStatus(
      {
        kind,
        id: String(id),
        status: decision === "suspend" ? "suspended" : "rejected",
        note: String(note ?? ""),
      },
      context,
    );

    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason ?? "failed",
        message:
          result.reason === "reason_required"
            ? "Say why. A decision nobody can explain is not a decision."
            : "That application could not be updated.",
      };
    }

    revalidatePath("/admin/partners");
    return { ok: true };
  } catch (error) {
    return failure(error, "That application could not be updated.");
  }
}

export async function decideCommission(
  commissionId: string,
  decision: "approve" | "reverse",
  reason?: string,
): Promise<GrowthResult> {
  try {
    const context = await requireUser();

    const result =
      decision === "approve"
        ? await approveCommission(String(commissionId), context)
        : await reverseCommission(String(commissionId), String(reason ?? ""), context);

    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason ?? "failed",
        message:
          result.reason === "on_hold"
            ? "This is still inside the refund hold period."
            : result.reason === "already_paid"
              ? "This has already been paid. Recover it by arrangement, not here."
              : result.reason === "reason_required"
                ? "Say why this commission is being reversed."
                : "That commission could not be updated.",
      };
    }

    revalidatePath("/admin/partners");
    return { ok: true };
  } catch (error) {
    return failure(error, "That commission could not be updated.");
  }
}

export async function reverseReferralReward(
  referralId: string,
  reason: string,
): Promise<GrowthResult> {
  try {
    const context = await requireUser();
    const result = await clawBackReward(
      String(referralId),
      String(reason ?? ""),
      context,
    );

    revalidatePath("/admin/referrals");
    // Reported honestly: a balance already spent cannot be recovered without
    // putting somebody into debt, and the caller should know that happened.
    return result.ok
      ? { ok: true }
      : {
          ok: false,
          reason: "partial",
          message: "Recorded, but part of the credit had already been spent.",
        };
  } catch (error) {
    return failure(error, "That reward could not be reversed.");
  }
}
