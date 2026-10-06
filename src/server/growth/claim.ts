"use server";

import { cookies, headers } from "next/headers";

import { logger } from "@/lib/logger";
import { getAuthContext } from "@/server/auth";
import { attributeSignup } from "@/server/growth/referrals";

/**
 * Claiming a referral after signup.
 *
 * A Clerk webhook creates the user row, but a webhook has no browser and
 * therefore no cookie: it cannot know which link somebody arrived through. So
 * attribution happens on the first signed-in page load that still carries the
 * cookie, and the cookie is deleted whatever the outcome.
 *
 * Deleting on failure as well as on success is deliberate. A cookie that
 * survives a refused attribution would retry on every navigation for ninety
 * days, which is both a pointless write and a cookie that outlived its
 * purpose.
 */

const REFERRAL_COOKIE = "bl_ref";

export async function claimReferral(): Promise<{ claimed: boolean }> {
  const jar = await cookies();
  const code = jar.get(REFERRAL_COOKIE)?.value;
  if (!code) return { claimed: false };

  // Cleared first, so a failure part-way through cannot leave it to retry.
  jar.delete(REFERRAL_COOKIE);

  const auth = await getAuthContext();
  if (!auth) return { claimed: false };

  try {
    const headerList = await headers();
    const forwarded = headerList.get("x-forwarded-for");

    const outcome = await attributeSignup({
      code,
      userId: auth.user.id,
      email: auth.user.email,
      ip: forwarded?.split(",")[0]?.trim() ?? headerList.get("x-real-ip"),
    });

    if (!outcome.ok) {
      logger.info("referral claim refused", { reason: outcome.reason });
      return { claimed: false };
    }

    return { claimed: true };
  } catch (error) {
    // A referral that cannot be attributed must never stop somebody reaching
    // their own account.
    logger.error("referral claim failed", { error });
    return { claimed: false };
  }
}
