"use client";

import { useState } from "react";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { groupedSectionsFor } from "@/config/admin-nav";
import type { UserRole } from "@/config/roles";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/**
 * The console sidebar, on a phone.
 *
 * The same `groupedSectionsFor` call as the desktop sidebar, so the two cannot
 * show different things to the same role. Controlled, so tapping a link closes
 * the sheet rather than leaving it covering the page just navigated to.
 */
export function AdminMobileNav({ role, active }: { role: UserRole; active: string }) {
  const t = useTranslations("adminConsole");
  const [open, setOpen] = useState(false);
  const groups = groupedSectionsFor(role);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="px-2 lg:hidden"
          aria-label={t("openMenu")}
        >
          <Menu className="size-5" aria-hidden />
        </Button>
      </SheetTrigger>

      <SheetContent title={t("title")} closeLabel={t("closeMenu")}>
        <nav className="flex flex-col gap-5">
          {groups.map(({ group, sections }) => (
            <div key={group} className="flex flex-col gap-1">
              <p className="text-eyebrow text-tertiary uppercase">
                {t(`groups.${group}`)}
              </p>
              <ul className="flex flex-col">
                {sections.map((section) => (
                  <li key={section.id}>
                    <SheetClose asChild>
                      <Link
                        href={`/admin${section.path}`}
                        aria-current={section.id === active ? "page" : undefined}
                        className={cn(
                          "-mx-2 block rounded-md px-2 py-2 text-body-sm",
                          "duration-fast transition-colors ease-out-quint hover:bg-hover",
                          section.id === active
                            ? "font-medium text-primary"
                            : "text-secondary",
                        )}
                      >
                        {t(`sections.${section.id as "dashboard"}`)}
                      </Link>
                    </SheetClose>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
