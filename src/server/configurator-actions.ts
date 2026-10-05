"use server";

import { platformConflict } from "@/config/platforms";
import { draftSchema } from "@/lib/configurator/draft";
import { logger } from "@/lib/logger";
import { assessScope } from "@/lib/scope";
import type { ScopeAssessment } from "@/lib/scope";

/**
 * Scope assessment.
 *
 * Deliberately outside the app directory. Importing a server action into a
 * client component through an alias whose path contains a route group and a
 * dynamic segment -- `@/app/[locale]/(marketing)/...` -- left the client
 * module silently un-hydrated: the markup rendered, the chunks loaded, and no
 * error was reported in dev or production. Keeping actions in `src/server`
 * sidesteps the bracketed path entirely.
 *
 * Runs on the server for two reasons. The rules decide a price, so they are
 * not shipped to the browser where they could be read and gamed; and this is
 * the seam an AI-backed assessor plugs into later, which will need a server
 * runtime and a provider key.
 *
 * The draft arrives from the client and is therefore untrusted. It is
 * re-parsed against the same schema the form uses rather than believed.
 */

export type AssessResult =
  | { ok: true; assessment: ScopeAssessment }
  | { ok: false; reason: "invalid_draft" | "invalid_platforms" | "failed" };

export async function assessDraft(rawDraft: unknown): Promise<AssessResult> {
  const parsed = draftSchema.safeParse(rawDraft);

  if (!parsed.success) {
    logger.warn("configurator draft failed validation", {
      issues: parsed.error.issues.map((issue) => issue.path.join(".")),
    });
    return { ok: false, reason: "invalid_draft" };
  }

  const draft = parsed.data;

  if (!draft.buildType) return { ok: false, reason: "invalid_draft" };

  // Re-checked server-side: the client disables Next on a conflict, but a
  // disabled button is a convenience, not a control.
  if (platformConflict(draft.buildType, draft.platforms) !== "none") {
    return { ok: false, reason: "invalid_platforms" };
  }

  try {
    const assessment = await assessScope({
      buildType: draft.buildType,
      ideaText: draft.intake.description,
      locale: draft.locale,
      selectedCapabilities: draft.selectedCapabilities,
      estimatedScreens: draft.estimatedScreens ?? undefined,
      platforms: draft.platforms,
      designApproach: draft.design.approach ?? undefined,
      context: {
        businessName: draft.intake.businessName,
        industry: draft.intake.industry,
        targetCustomers: draft.intake.targetCustomers,
        desiredOutcome: draft.intake.desiredOutcome,
      },
    });

    return { ok: true, assessment };
  } catch (error) {
    // A pricing failure must never surface as a broken page on the one screen
    // the customer is trying to buy from.
    logger.error("scope assessment failed", { error });
    return { ok: false, reason: "failed" };
  }
}
