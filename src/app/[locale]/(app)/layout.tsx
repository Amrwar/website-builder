import type { ReactNode } from "react";

import { cookies } from "next/headers";
import { UserButton } from "@clerk/nextjs";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { ReferralClaim } from "@/components/growth/referral-claim";
import { Logo } from "@/components/site/logo";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { APP_CLIENT_NAMESPACES, pickMessages } from "@/i18n/client-messages";
import { Link } from "@/i18n/navigation";
import { getAuthContext } from "@/server/auth";
import { unreadCountFor } from "@/server/notifications";
import { isStaffRole } from "@/config/roles";
import { cn } from "@/lib/cn";

/**
 * Signed-in application shell.
 *
 * Separate chrome from the marketing site: no pricing, no sales navigation,
 * and the account control always in reach.
 *
 * The staff link is hidden for customers, but hiding is presentation only --
 * `/admin` re-checks the permission server-side, because a hidden link is not
 * a closed door.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("app");
  const context = await getAuthContext();
  const showStaffLink = context ? isStaffRole(context.user.role) : false;

  // One count, in the shell, so it is visible from every signed-in page.
  const unread = context ? await unreadCountFor(context) : 0;

  // Rendered only when a referral cookie is actually present, so the ordinary
  // signed-in page load does no extra work at all.
  const hasReferralCookie = (await cookies()).has("bl_ref");

  return (
    // Nested so the signed-in application's copy reaches its client
    // components without being shipped to every marketing page.
    <NextIntlClientProvider
      messages={pickMessages(await getMessages(), APP_CLIENT_NAMESPACES)}
    >
      <div className="flex min-h-dvh flex-col">
        {hasReferralCookie ? <ReferralClaim /> : null}
        <header className="sticky top-0 z-30 border-b border-line-subtle bg-canvas">
          <Container width="wide">
            <div className="flex h-16 items-center justify-between gap-6">
              <Link
                href="/"
                className="shrink-0 rounded-sm text-primary hover:opacity-70"
              >
                <Logo />
              </Link>

              <nav aria-label={t("nav")} className="flex items-center gap-1">
                <Link
                  href="/projects"
                  className={cn(
                    "rounded-md px-3 py-2 text-body-sm whitespace-nowrap text-secondary",
                    "duration-fast transition-colors ease-out-quint hover:bg-hover hover:text-primary",
                  )}
                >
                  {t("builds")}
                </Link>
                <Link
                  href="/billing"
                  className={cn(
                    "rounded-md px-3 py-2 text-body-sm whitespace-nowrap text-secondary",
                    "duration-fast transition-colors ease-out-quint hover:bg-hover hover:text-primary",
                  )}
                >
                  {t("billing")}
                </Link>
                <Link
                  href="/notifications"
                  className={cn(
                    "relative rounded-md px-3 py-2 text-body-sm whitespace-nowrap text-secondary",
                    "duration-fast transition-colors ease-out-quint hover:bg-hover hover:text-primary",
                  )}
                >
                  {t("notifications")}
                  {/* A count, not a dot: "3 unread" is actionable and a dot is
                    not. Announced to screen readers through the label rather
                    than left as a bare number next to a word. */}
                  {unread > 0 ? (
                    <span
                      className="min-inline-size-5 text-on-accent ms-1.5 inline-flex items-center justify-center rounded-full bg-accent px-1.5 text-caption"
                      aria-label={t("unreadBadge", { count: unread })}
                      data-numeric
                    >
                      {unread}
                    </span>
                  ) : null}
                </Link>
                <Link
                  href="/account"
                  className={cn(
                    "rounded-md px-3 py-2 text-body-sm whitespace-nowrap text-secondary",
                    "duration-fast transition-colors ease-out-quint hover:bg-hover hover:text-primary",
                  )}
                >
                  {t("account")}
                </Link>
                {showStaffLink ? (
                  <Link
                    href="/admin"
                    className={cn(
                      "rounded-md px-3 py-2 text-body-sm whitespace-nowrap text-secondary",
                      "duration-fast transition-colors ease-out-quint hover:bg-hover hover:text-primary",
                    )}
                  >
                    {t("staff")}
                  </Link>
                ) : null}
                <UserButton appearance={clerkAppearance} />
              </nav>
            </div>
          </Container>
        </header>

        <main id="main" className="flex-1">
          {children}
        </main>
      </div>
    </NextIntlClientProvider>
  );
}
