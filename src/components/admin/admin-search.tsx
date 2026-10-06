"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { runAdminSearch } from "@/server/admin-actions";
import { cn } from "@/lib/cn";

/**
 * Global search.
 *
 * Results come from a server action that applies the caller's own permissions,
 * so a developer searching an invoice number gets nothing back rather than a
 * result they cannot open. Nothing is filtered in the browser, because
 * anything sent to the browser has already been disclosed.
 *
 * Debounced, and late responses are discarded by sequence number -- without
 * that, a slow query for "ac" can land after a fast one for "acme" and replace
 * the right answer with a stale one.
 */

interface Hit {
  type: string;
  id: string;
  label: string;
  detail: string;
  href: string;
}

export function AdminSearch() {
  const t = useTranslations("adminConsole.search");
  const router = useRouter();

  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  const sequence = useRef(0);

  const query = term.trim();
  const tooShort = query.length < 2;

  useEffect(() => {
    // The short-query case is derived during render rather than written to
    // state here: setting state synchronously in an effect cascades a second
    // render for every keystroke below the threshold.
    if (tooShort) return;

    const ticket = ++sequence.current;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await runAdminSearch(query);
        // Discard anything that is no longer the latest request.
        if (ticket !== sequence.current) return;
        setHits(result.ok ? (result.hits as Hit[]) : []);
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [query, tooShort]);

  return (
    <div className="relative w-full max-w-md">
      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-tertiary"
          aria-hidden
        />
        <Input
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delayed so a click on a result lands before the list unmounts.
            setTimeout(() => setOpen(false), 150);
          }}
          placeholder={t("placeholder")}
          aria-label={t("placeholder")}
          className="ps-9"
        />
      </div>

      {open && !tooShort ? (
        <div
          role="listbox"
          aria-label={t("placeholder")}
          className={cn(
            "absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto",
            "rounded-lg border border-line bg-canvas p-1 shadow-lg",
          )}
        >
          {hits === null ? (
            <p className="px-3 py-2 text-caption text-tertiary">{t("loading")}</p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-2 text-caption text-tertiary">{t("empty")}</p>
          ) : (
            <ul className="flex flex-col">
              {hits.map((hit) => (
                <li key={`${hit.type}:${hit.id}`}>
                  <button
                    type="button"
                    onMouseDown={() => router.push(hit.href)}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-start hover:bg-hover"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-body-sm text-primary">
                        {hit.label}
                      </span>
                      <span className="block truncate text-caption text-tertiary">
                        {hit.detail}
                      </span>
                    </span>
                    <span className="shrink-0 text-caption text-tertiary">
                      {t(`types.${hit.type as "project"}`)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
