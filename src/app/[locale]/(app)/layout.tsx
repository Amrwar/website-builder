import type { ReactNode } from "react";

import { UserButton } from "@clerk/nextjs";
import { getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { Logo } from "@/components/site/logo";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { Link } from "@/i18n/navigation";
import { getAuthContext } from "@/server/auth";
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

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line-subtle bg-canvas">
        <Container width="wide">
          <div className="flex h-16 items-center justify-between gap-6">
            <Link href="/" className="shrink-0 rounded-sm text-primary hover:opacity-70">
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
  );
}
