import { getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { Logo } from "@/components/site/logo";
import { BRAND } from "@/config/brand";
import { FOOTER_NAV } from "@/config/navigation";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

export async function SiteFooter() {
  const t = await getTranslations("footer");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line-subtle bg-subtle">
      <Container width="wide" className="py-14 sm:py-16">
        <div className="flex flex-col gap-12 lg:flex-row lg:justify-between">
          <div className="flex max-w-xs flex-col gap-4">
            <Logo className="text-primary" />
            <p className="text-body-sm text-secondary">{t("tagline")}</p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:gap-16">
            {FOOTER_NAV.map((column) => (
              <div key={column.titleKey} className="flex flex-col gap-3">
                <h2 className="text-eyebrow text-tertiary uppercase">
                  {t(column.titleKey)}
                </h2>
                <ul className="flex flex-col gap-2.5">
                  {column.items.map((item) => (
                    <li key={item.key}>
                      {item.status === "live" ? (
                        <Link
                          href={item.href}
                          className={cn(
                            "rounded-sm text-body-sm text-secondary",
                            "duration-fast transition-colors ease-out-quint",
                            "hover:text-primary",
                          )}
                        >
                          {t(`links.${item.key}`)}
                        </Link>
                      ) : (
                        /* Not yet a route. Rendered as plain text rather than
                         * a link so nothing in the footer leads to a 404.
                         * Tertiary, not the disabled token: this is text a
                         * visitor reads, not an inactive control, so the
                         * contrast exemption for disabled UI does not apply —
                         * the disabled token measured 2.24:1. */
                        <span className="text-body-sm text-tertiary">
                          {t(`links.${item.key}`)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 border-t border-line-subtle pt-6">
          <p className="text-caption text-tertiary">
            {t("rights", { year, brand: BRAND.name })}
          </p>
        </div>
      </Container>
    </footer>
  );
}
