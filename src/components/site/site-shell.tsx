import type { ReactNode } from "react";

import { getTranslations } from "next-intl/server";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import type { Locale } from "@/config/locales";
import { cn } from "@/lib/cn";

/**
 * Public-site chrome: skip link, header, main landmark, footer.
 *
 * Shared by the marketing route group and by the error and not-found screens,
 * which render outside that group but must still look like the same site.
 * Without this they would each re-assemble the chrome and drift apart.
 */
export async function SiteShell({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const t = await getTranslations("nav");

  return (
    <>
      <a
        href="#main"
        className={cn(
          "sr-only-focusable",
          "absolute z-50 m-3 rounded-md px-4 py-2",
          "bg-action text-body-sm font-medium text-action-fg",
        )}
      >
        {t("skipToContent")}
      </a>
      <SiteHeader locale={locale} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
