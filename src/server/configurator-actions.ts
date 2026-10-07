"use server";

import { draftSchema } from "@/lib/configurator/draft";
import { logger } from "@/lib/logger";
import type { ProjectAssessment } from "@/lib/engine";
import { quoteCurrencyFor } from "@/lib/pricing/localize";
import { assessAndPrice, type ConfiguredDraft } from "@/server/engine";
import { getAuthContext } from "@/server/auth";
import { RATE_LIMITS, consume, limiterKey } from "@/server/platform/rate-limit";

/**
 * Scope assessment and pricing, for the configurator.
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
 * It delegates entirely to `server/engine`. Before Phase 10 this action
 * assessed scope while the order service assessed *and* priced, so the figure
 * a customer configured against and the figure they were charged came from two
 * code paths. There is now one.
 *
 * The draft arrives from the client and is therefore untrusted. It is
 * re-parsed against the same schema the form uses rather than believed.
 */

export type AssessDraftResult =
  | { ok: true; assessment: ProjectAssessment }
  | {
      ok: false;
      reason: "invalid_draft" | "invalid_platforms" | "failed" | "rate_limited";
    };

export async function assessDraft(
  rawDraft: unknown,
  discountCode?: string | null,
): Promise<AssessDraftResult> {
  const parsed = draftSchema.safeParse(rawDraft);

  if (!parsed.success) {
    logger.warn("configurator draft failed validation", {
      issues: parsed.error.issues.map((issue) => issue.path.join(".")),
    });
    return { ok: false, reason: "invalid_draft" };
  }

  const draft = parsed.data;
  if (!draft.buildType) return { ok: false, reason: "invalid_draft" };

  // The currency comes from the signed-in customer's saved preference, never
  // from the draft. A browser that could name its own currency could pick the
  // one with the softest rate.
  const auth = await getAuthContext();

  // Anonymous and compute-bearing: every call runs the scope engine and the
  // catalogue queries. Checked after validation, so a malformed draft costs
  // the caller nothing it could not already spend.
  const budget = consume(
    "assess",
    await limiterKey(auth?.user.id ?? null),
    RATE_LIMITS.assess,
  );
  if (!budget.ok) return { ok: false, reason: "rate_limited" };
  const currency = quoteCurrencyFor(auth?.user.preferredCurrency);

  return assessAndPrice(draft as ConfiguredDraft, {
    currency,
    discountCode: discountCode ?? null,
  });
}
