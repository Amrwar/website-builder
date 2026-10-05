"use client";

import { useState } from "react";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";

import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import type { Locale } from "@/config/locales";
import { PRIMARY_NAV } from "@/config/navigation";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

export interface MobileNavProps {
  locale: Locale;
}

/**
 * Compact navigation for small viewports.
 *
 * Controlled rather than uncontrolled so that tapping a link closes the panel:
 * an anchor jump does not unmount the sheet by itself, which would leave the
 * overlay covering the section the user just navigated to.
 */
export function MobileNav({ locale }: MobileNavProps) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="px-2 md:hidden" aria-label={t("openMenu")}>
          <Menu className="size-5" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent title={t("primary")} hideTitle closeLabel={t("closeMenu")}>
        <nav aria-label={t("primary")}>
          <ul className="flex flex-col">
            {PRIMARY_NAV.filter((item) => item.status === "live").map((item) => (
              <li key={item.key}>
                <SheetClose asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      "-mx-2 block rounded-md px-2 py-2.5",
                      "text-display-sm text-primary",
                      "transition-colors duration-fast ease-out-quint hover:bg-hover",
                    )}
                  >
                    {t(item.key)}
                  </Link>
                </SheetClose>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-6 border-t border-line-subtle pt-6">
          <SheetClose asChild>
            <Link
              href="/configure"
              className={buttonVariants({ variant: "primary", fullWidth: true })}
            >
              {t("startBuild")}
            </Link>
          </SheetClose>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-line-subtle pt-6">
          <LocaleSwitcher current={locale} />
          <ThemeToggle />
        </div>
      </SheetContent>
    </Sheet>
  );
}
