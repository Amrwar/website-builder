"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import type { z } from "zod";

import { db } from "@/db/client";
import { users } from "@/db/schema";
import { cookies } from "next/headers";

import { LOCALE_COOKIE } from "@/i18n/routing";
import { businessSchema, preferencesSchema, profileSchema } from "@/lib/account/schema";
import { ApiError } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import { requireUser } from "./auth";

/**
 * Account mutations.
 *
 * Every action re-establishes who the caller is from the Clerk session and
 * writes only to that person's own row. The user id is never taken from the
 * submitted payload: a server action is a public HTTP endpoint with a
 * generated name, not a private function call, and treating its arguments as
 * trusted is the classic way one account edits another.
 */

export type ActionResult =
  { ok: true } | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

function fieldErrorsFrom(error: z.ZodError): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (errors[key] ??= []).push(issue.message);
  }
  return errors;
}

/** Shared shell: authenticate, validate, write the caller's own row. */
async function updateOwnRow<Schema extends z.ZodType>(
  schema: Schema,
  raw: unknown,
  label: string,
): Promise<ActionResult> {
  try {
    const { user } = await requireUser();

    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        message: "Some details need attention.",
        fieldErrors: fieldErrorsFrom(parsed.error),
      };
    }

    await db
      .update(users)
      .set({ ...(parsed.data as Record<string, unknown>), updatedAt: new Date() })
      // Scoped to the authenticated row. Even a crafted payload cannot widen
      // this, because the id comes from the session rather than the request.
      .where(eq(users.id, user.id));

    logger.info("account updated", { userId: user.id, section: label });
    revalidatePath("/account");
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, message: error.message };
    }
    logger.error("account update failed", { section: label, error });
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}

export async function updateProfile(raw: unknown): Promise<ActionResult> {
  return updateOwnRow(profileSchema, raw, "profile");
}

export async function updateBusiness(raw: unknown): Promise<ActionResult> {
  return updateOwnRow(businessSchema, raw, "business");
}

export async function updatePreferences(raw: unknown): Promise<ActionResult> {
  const result = await updateOwnRow(preferencesSchema, raw, "preferences");
  if (!result.ok) return result;

  /**
   * The stored preference is the durable record; the cookie is what the router
   * can actually act on.
   *
   * The UI language comes from the URL, because the locale is a route segment
   * and a shared French link has to render French for whoever opens it. That
   * means saving "French" in the database changed nothing on its own: the
   * customer saved a preference and the site stayed in English, which reads as
   * a broken setting. Writing the detection cookie here is what makes an
   * unprefixed URL resolve to their language on the next request.
   *
   * Deliberately not read in the proxy instead: that would put a database
   * query on the edge of every single request, including every anonymous
   * marketing page, to answer a question a cookie already answers.
   */
  const parsed = preferencesSchema.safeParse(raw);
  if (parsed.success) {
    const { name, ...attributes } = LOCALE_COOKIE;
    // Not httpOnly: next-intl's own locale switcher reads it client-side, and
    // it holds a language, not a secret.
    (await cookies()).set(name, parsed.data.preferredLocale, attributes);
    // Every page is rendered in a locale, so the whole tree is now stale.
    revalidatePath("/", "layout");
  }

  return result;
}
