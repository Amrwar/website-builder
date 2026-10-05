"use client";

import { useTransition } from "react";

import { ChevronDown, Globe } from "lucide-react";
import { useTranslations } from "next-intl";

import { LOCALES, LOCALE_DEFINITIONS, type Locale } from "@/config/locales";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

export interface LocaleSwitcherProps {
  current: Locale;
  className?: string;
}

/**
 * Language switcher.
 *
 * A native `select` rather than a custom popover: it is keyboard- and
 * screen-reader-correct for free, and on mobile it opens the platform picker,
 * which is a better experience than any in-page menu.
 *
 * Switching preserves the current path, so a visitor reading `/pricing` lands
 * on `/fr/pricing` rather than being sent back to the home page.
 */
export function LocaleSwitcher({ current, className }: LocaleSwitcherProps) {
  const t = useTranslations("localeSwitcher");
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  return (
    <div
      className={cn(
        "relative inline-flex items-center rounded-md border border-line",
        "bg-subtle text-secondary",
        "transition-colors duration-fast ease-out-quint",
        "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus",
        "hover:text-primary",
        isPending && "opacity-60",
        className,
      )}
    >
      <Globe className="pointer-events-none absolute start-2.5 size-3.5" aria-hidden />
      <select
        aria-label={t("label")}
        value={current}
        disabled={isPending}
        data-focus-managed
        onChange={(event) => {
          const next = event.target.value as Locale;
          startTransition(() => {
            router.replace(pathname, { locale: next });
          });
        }}
        className={cn(
          "h-7 cursor-pointer appearance-none bg-transparent",
          "ps-8 pe-7 text-caption font-medium",
          "outline-none",
        )}
      >
        {LOCALES.map((locale) => (
          <option key={locale} value={locale} lang={locale}>
            {LOCALE_DEFINITIONS[locale].nativeName}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute end-2.5 size-3.5" aria-hidden />
    </div>
  );
}
