import { cookies, headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { ATTRIBUTION_WINDOW_DAYS } from "@/config/growth";
import { logger } from "@/lib/logger";
import { getAuthContext } from "@/server/auth";
import { attributeSignup, countVisit, resolveCode } from "@/server/growth/referrals";

export const dynamic = "force-dynamic";

/**
 * The referral link.
 *
 * `/r/CODE` is short enough to say out loud, which is the point: a referral
 * link that has to be copied from an email is one nobody shares in person.
 *
 * Deliberately outside `[locale]`. A shared link should work whatever locale
 * the sender was using, and the redirect lands on the localised home page,
 * where the visitor's own preference applies.
 *
 * Two paths, because a visitor may already have an account:
 *
 *  - **Signed out** — the code goes into a first-party cookie and the visitor
 *    continues to the site. Attribution happens after they sign up.
 *  - **Signed in** — attribution is attempted immediately and no cookie is
 *    set. A cookie that outlived its purpose is a tracking cookie.
 *
 * An unknown or withdrawn code redirects silently rather than erroring. The
 * visitor did nothing wrong, and "invalid referral code" on a landing page is
 * a worse first impression than simply arriving.
 */
export const REFERRAL_COOKIE = "bl_ref";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const home = new URL("/", request.url);

  const resolved = await resolveCode(code);
  if (!resolved) return NextResponse.redirect(home);

  await countVisit(resolved.id);

  const auth = await getAuthContext();

  if (auth) {
    // Already has an account. Attribute now if they are eligible; the service
    // refuses a second attribution and every self-referral by itself.
    try {
      const headerList = await headers();
      const outcome = await attributeSignup({
        code: resolved.code,
        userId: auth.user.id,
        email: auth.user.email,
        ip: clientIp(headerList),
      });

      if (!outcome.ok) {
        logger.info("referral not attributed", { reason: outcome.reason });
      }
    } catch (error) {
      // A visitor following a link must reach the site whatever the
      // attribution decides. An error page here would punish the person who
      // did nothing wrong.
      logger.error("referral attribution failed", { error });
    }

    return NextResponse.redirect(home);
  }

  const jar = await cookies();
  jar.set(REFERRAL_COOKIE, resolved.code, {
    // First-party, not readable by script, and gone when attribution lapses.
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ATTRIBUTION_WINDOW_DAYS * 86_400,
  });

  return NextResponse.redirect(home);
}

/**
 * The caller's address, for the shared-network signal.
 *
 * Read from the proxy headers the platform sets, never from anything the
 * client can choose. `x-forwarded-for` is a list; the first entry is the
 * original client as recorded by the edge.
 */
function clientIp(headerList: Headers): string | null {
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return headerList.get("x-real-ip");
}
