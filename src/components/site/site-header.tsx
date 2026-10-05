import { getTranslations } from "next-intl/server";

import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { MobileNav } from "@/components/site/mobile-nav";
import { Logo } from "@/components/site/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Container } from "@/components/layout/container";
import { buttonVariants } from "@/components/ui/button";
import type { Locale } from "@/config/locales";
import { PRIMARY_NAV } from "@/config/navigation";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

export interface SiteHeaderProps {
  locale: Locale;
}

/**
 * Marketing site header.
 *
 * A solid surface with a hairline rule rather than a translucent blurred bar:
 * the blur reads as decoration and costs a compositing layer on every scroll
 * frame, which is felt most on the mid-range phones this has to be good on.
 */
export async function SiteHeader({ locale }: SiteHeaderProps) {
  const t = await getTranslations("nav");
  const items = PRIMARY_NAV.filter((item) => item.status === "live");

  return (
    <header className="sticky top-0 z-30 border-b border-line-subtle bg-canvas">
      <Container width="wide">
        <div className="flex h-16 items-center justify-between gap-6">
          <Link
            href="/"
            className="shrink-0 rounded-sm text-primary transition-opacity hover:opacity-70"
          >
            <Logo />
          </Link>

          <nav aria-label={t("primary")} className="hidden shrink-0 md:block">
            <ul className="flex items-center gap-1">
              {items.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className={cn(
                      "rounded-md px-3 py-2 text-body-sm whitespace-nowrap text-secondary",
                      "duration-fast transition-colors ease-out-quint",
                      "hover:bg-hover hover:text-primary",
                    )}
                  >
                    {t(item.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 md:flex">
              <LocaleSwitcher current={locale} />
              <ThemeToggle />
            </div>
            <Link
              href="/configure"
              className={cn(
                buttonVariants({ variant: "primary", size: "sm" }),
                "hidden sm:inline-flex",
              )}
            >
              {t("startBuild")}
            </Link>
            <MobileNav locale={locale} />
          </div>
        </div>
      </Container>
    </header>
  );
}
