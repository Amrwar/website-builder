"use client";

import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * Pagination.
 *
 * A `<nav>` with its own label, so it is reachable by landmark navigation and
 * distinguishable from the page's main navigation. The current page is marked
 * `aria-current="page"` rather than by styling alone.
 *
 * The window of page numbers collapses with ellipses so the control keeps a
 * fixed width regardless of how many pages exist. On small screens only the
 * previous/next controls and a position summary remain -- a row of numbered
 * targets at phone width is below a comfortable touch size.
 */

export interface PaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Accessible name for the nav landmark, e.g. "Build pages". */
  label: string;
  previousLabel: string;
  nextLabel: string;
  /** Builds the per-page accessible label, e.g. (n) => `Page ${n}`. */
  pageLabel: (page: number) => string;
  /** Mobile summary, e.g. (p, total) => `Page ${p} of ${total}`. */
  summaryLabel: (page: number, pageCount: number) => string;
  className?: string;
}

/** Page numbers to show, with `null` marking a collapsed run. */
export function paginationRange(page: number, pageCount: number): (number | null)[] {
  // First, last, current, and one neighbour either side; everything else
  // collapses. Seven slots is the most that stays scannable at a glance.
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, pageCount, page, page - 1, page + 1]);
  const visible = [...pages]
    .filter((candidate) => candidate >= 1 && candidate <= pageCount)
    .sort((a, b) => a - b);

  const output: (number | null)[] = [];
  let previous: number | undefined;
  for (const candidate of visible) {
    if (previous !== undefined && candidate - previous > 1) output.push(null);
    output.push(candidate);
    previous = candidate;
  }
  return output;
}

const CONTROL = [
  "grid h-9 min-w-9 place-items-center rounded-md px-2 text-body-sm",
  "transition-colors duration-fast ease-out-quint",
  "hover:bg-hover hover:text-primary",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
  "disabled:pointer-events-none disabled:text-fg-disabled",
].join(" ");

export function Pagination({
  page,
  pageCount,
  onPageChange,
  label,
  previousLabel,
  nextLabel,
  pageLabel,
  summaryLabel,
  className,
}: PaginationProps) {
  if (pageCount <= 1) return null;

  return (
    <nav
      aria-label={label}
      className={cn("flex items-center justify-between gap-4", className)}
    >
      <button
        type="button"
        className={cn(CONTROL, "text-secondary")}
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
      >
        {/* Chevrons encode direction, so they mirror under RTL. */}
        <ChevronLeft className="rtl-flip size-4" aria-hidden />
        <span className="sr-only sm:not-sr-only sm:ms-1">{previousLabel}</span>
      </button>

      <ul className="hidden items-center gap-1 sm:flex">
        {paginationRange(page, pageCount).map((candidate, index) =>
          candidate === null ? (
            <li
              key={`gap-${index}`}
              aria-hidden
              className="grid h-9 w-9 place-items-center"
            >
              <MoreHorizontal className="size-4 text-tertiary" />
            </li>
          ) : (
            <li key={candidate}>
              <button
                type="button"
                aria-current={candidate === page ? "page" : undefined}
                aria-label={pageLabel(candidate)}
                onClick={() => onPageChange(candidate)}
                className={cn(
                  CONTROL,
                  "tabular-nums",
                  candidate === page
                    ? "bg-action font-medium text-action-fg hover:bg-action-hover hover:text-action-fg"
                    : "text-secondary",
                )}
              >
                {candidate}
              </button>
            </li>
          ),
        )}
      </ul>

      {/* Phone fallback: a summary instead of an unusable row of targets. */}
      <p className="text-body-sm text-secondary tabular-nums sm:hidden">
        {summaryLabel(page, pageCount)}
      </p>

      <button
        type="button"
        className={cn(CONTROL, "text-secondary")}
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pageCount}
      >
        <span className="sr-only sm:not-sr-only sm:me-1">{nextLabel}</span>
        <ChevronRight className="rtl-flip size-4" aria-hidden />
      </button>
    </nav>
  );
}
