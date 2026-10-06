"use client";

import { useState } from "react";

import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/**
 * Search, filter and sort controls for an admin table.
 *
 * Everything lives in the URL rather than in component state. A filtered view
 * is then a link: it survives a reload, it can be bookmarked, and "look at the
 * red ones" is a message someone can actually send a colleague.
 *
 * Filters render as links rather than a select, so they work without
 * JavaScript and are reachable by keyboard without a custom listbox. Only the
 * search box needs to be interactive.
 */

export interface ToolbarFilter {
  name: string;
  label: string;
  value?: string;
  options: { value: string; label: string }[];
}

export function AdminTableToolbar({
  basePath,
  search,
  filters = [],
  sorts = [],
  sort,
}: {
  basePath: string;
  search?: string;
  filters?: ToolbarFilter[];
  sorts?: { value: string; label: string }[];
  sort?: string;
}) {
  const t = useTranslations("adminConsole.table");
  const router = useRouter();
  const [term, setTerm] = useState(search ?? "");

  /** Rebuilds the URL, dropping the page so a new filter starts at page one. */
  function hrefWith(overrides: Record<string, string | undefined>): string {
    const next = new URLSearchParams();
    if (search) next.set("q", search);
    if (sort) next.set("sort", sort);
    for (const filter of filters) {
      if (filter.value) next.set(filter.name, filter.value);
    }
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  }

  const hasFilters = Boolean(search) || filters.some((filter) => filter.value);

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          router.push(hrefWith({ q: term.trim() || undefined, page: undefined }));
        }}
      >
        <div className="relative w-full max-w-sm">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-tertiary"
            aria-hidden
          />
          <Input
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("search")}
            className="ps-9"
          />
        </div>
        <Button type="submit" variant="secondary" size="sm">
          {t("search")}
        </Button>
      </form>

      {(filters.length > 0 || sorts.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {filters.map((filter) => (
            <div key={filter.name} className="flex flex-wrap items-center gap-1.5">
              <span className="text-caption text-tertiary">{filter.label}</span>
              <Link
                href={hrefWith({ [filter.name]: undefined, page: undefined })}
                className={chip(!filter.value)}
              >
                {t("all")}
              </Link>
              {filter.options.map((option) => (
                <Link
                  key={option.value}
                  href={hrefWith({ [filter.name]: option.value, page: undefined })}
                  className={chip(filter.value === option.value)}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          ))}

          {sorts.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-caption text-tertiary">{t("sort")}</span>
              {sorts.map((option) => (
                <Link
                  key={option.value}
                  href={hrefWith({ sort: option.value, page: undefined })}
                  className={chip(sort === option.value)}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          ) : null}

          {hasFilters ? (
            <Link
              href={basePath}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "ms-auto gap-1.5",
              )}
            >
              <X className="size-3.5" aria-hidden />
              {t("clear")}
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}

function chip(active: boolean): string {
  return cn(
    "rounded-full border px-2.5 py-1 text-caption",
    "duration-fast transition-colors ease-out-quint",
    active
      ? "border-transparent bg-action text-action-fg"
      : "border-line text-secondary hover:bg-hover hover:text-primary",
  );
}
