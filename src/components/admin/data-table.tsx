import type { ReactNode } from "react";

import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { paginationRange } from "@/lib/pagination";
import { cn } from "@/lib/cn";

/**
 * The admin table.
 *
 * Every list in the console renders through this, so search, filtering,
 * pagination, the empty state and mobile behaviour are solved once rather than
 * nine slightly different times.
 *
 * ── On mobile ─────────────────────────────────────────────────────────────
 * The brief asked for tables that do not become unusable on a phone. A table
 * with eleven columns cannot be made to work at 375px by scrolling it, so this
 * renders **two layouts from one definition**: a real `<table>` from `md` up,
 * and a stacked card list below it. Columns opt into the card with `primary`,
 * `secondary` and `meta`, so the phone view shows what matters instead of a
 * squashed version of everything.
 * ──────────────────────────────────────────────────────────────────────────
 */

export interface Column<Row> {
  id: string;
  /** Column heading. */
  header: string;
  /** Cell content for the table layout. */
  cell: (row: Row) => ReactNode;
  /** Where this column appears in the stacked phone layout. */
  mobile?: "primary" | "secondary" | "meta" | "hidden";
  align?: "start" | "end";
  /** Hide below `lg`, for genuinely secondary columns. */
  wide?: boolean;
}

export interface DataTableProps<Row> {
  rows: readonly Row[];
  columns: readonly Column<Row>[];
  rowKey: (row: Row) => string;
  /** Makes the whole row navigable, in both layouts. */
  href?: (row: Row) => string;
  caption: string;
  empty: { title: string; description?: string };
  /** Shown instead of the generic empty state when filters are active. */
  filtered?: boolean;
  /**
   * True when the requested page is past the last one.
   *
   * Without this the body says "nothing yet" while the pager beside it says
   * there is 1 page -- two messages contradicting each other, and the wrong
   * one is the bigger, more prominent one. The table cannot work this out for
   * itself: it is handed rows, not the page count.
   */
  outOfRange?: boolean;
  toolbar?: ReactNode;
  pagination?: ReactNode;
}

export async function DataTable<Row>({
  rows,
  columns,
  rowKey,
  href,
  caption,
  empty,
  filtered = false,
  outOfRange = false,
  toolbar,
  pagination,
}: DataTableProps<Row>) {
  const t = await getTranslations("adminConsole.table");

  const visible = columns.filter((column) => column.mobile !== "hidden");
  const primary = columns.find((column) => column.mobile === "primary") ?? columns[0];
  const secondary = columns.filter((column) => column.mobile === "secondary");
  const meta = columns.filter((column) => column.mobile === "meta");

  return (
    <section className="flex flex-col gap-4">
      {toolbar}

      {rows.length === 0 ? (
        <EmptyState
          size="sm"
          title={
            outOfRange ? t("outOfRangeTitle") : filtered ? t("noMatch") : empty.title
          }
          description={outOfRange || filtered ? undefined : empty.description}
        />
      ) : (
        <>
          {/* --- Phone: one card per row ------------------------------- */}
          <ul className="flex flex-col gap-2 md:hidden">
            {rows.map((row) => {
              const body = (
                <div className="flex flex-col gap-2 rounded-lg border border-line p-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-body-sm font-medium text-primary">
                      {primary?.cell(row)}
                    </span>
                    {meta[0] ? <span>{meta[0].cell(row)}</span> : null}
                  </div>

                  {secondary.length > 0 ? (
                    <dl className="flex flex-wrap gap-x-4 gap-y-1">
                      {secondary.map((column) => (
                        <div key={column.id} className="flex items-baseline gap-1.5">
                          <dt className="text-caption text-tertiary">{column.header}</dt>
                          <dd className="text-caption text-secondary">
                            {column.cell(row)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}

                  {meta.length > 1 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {meta.slice(1).map((column) => (
                        <span key={column.id}>{column.cell(row)}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );

              return (
                <li key={rowKey(row)}>
                  {href ? (
                    <Link href={href(row)} className="block">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>

          {/* --- Tablet and up: a real table ---------------------------- */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-body-sm">
              <caption className="sr-only">{caption}</caption>
              <thead>
                <tr className="border-b border-line">
                  {visible.map((column) => (
                    <th
                      key={column.id}
                      scope="col"
                      className={cn(
                        "px-3 py-2.5 text-caption font-medium text-tertiary uppercase",
                        column.align === "end" ? "text-end" : "text-start",
                        column.wide && "hidden lg:table-cell",
                      )}
                    >
                      {column.header}
                    </th>
                  ))}
                  {href ? <th scope="col" className="w-px px-3" /> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    className="duration-fast border-b border-line-subtle transition-colors ease-out-quint hover:bg-hover"
                  >
                    {visible.map((column) => (
                      <td
                        key={column.id}
                        className={cn(
                          "px-3 py-3 align-middle text-secondary",
                          column.align === "end" ? "text-end" : "text-start",
                          column.wide && "hidden lg:table-cell",
                        )}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                    {href ? (
                      <td className="px-3 py-3 text-end">
                        <Link
                          href={href(row)}
                          className={cn(
                            buttonVariants({ variant: "ghost", size: "sm" }),
                            "whitespace-nowrap",
                          )}
                        >
                          {t("view")}
                        </Link>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {pagination}
    </section>
  );
}

/* -------------------------------------------------------------------------
 * Pagination
 * ---------------------------------------------------------------------- */

export interface PaginationProps {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  /** Builds the href for a page, preserving the current filters. */
  hrefFor: (page: number) => string;
}

export async function TablePagination({
  page,
  pageCount,
  total,
  pageSize,
  hrefFor,
}: PaginationProps) {
  const t = await getTranslations("adminConsole.table");
  if (total === 0) return null;

  /**
   * A page past the end renders as an empty table, which reads as "there is no
   * data" rather than "you asked for a page that does not exist". Reachable by
   * editing the query string, and by being on the last page when rows are
   * removed underneath you. Filters already reset the page, so this is the
   * remainder.
   */
  if (page > pageCount) {
    return (
      <nav
        className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle pt-4"
        aria-label={t("page", { page, pages: pageCount })}
      >
        <p className="text-caption text-tertiary">
          {t("outOfRange", { pages: pageCount })}
        </p>
        <Link
          href={hrefFor(pageCount)}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          {t("backToLastPage")}
        </Link>
      </nav>
    );
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle pt-4"
      aria-label={t("page", { page, pages: pageCount })}
    >
      <p className="text-caption text-tertiary">{t("showing", { from, to, total })}</p>

      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link
            href={hrefFor(page - 1)}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            {t("previous")}
          </Link>
        ) : null}

        {/*
          Numbered links, not just previous/next. The same window the design
          system's `Pagination` uses -- shared through `paginationRange` rather
          than reimplemented -- but rendered as links, because this table is a
          server component and its pages belong in the URL.

          Hidden on phones, where a row of numbered targets falls below a
          comfortable touch size; the position summary carries it there.
        */}
        {/* A lone "1" is noise, so the numbers appear only once there is a
            choice to make. */}
        <ul className={cn("hidden items-center gap-1", pageCount > 1 && "sm:flex")}>
          {paginationRange(page, pageCount).map((candidate, index) =>
            candidate === null ? (
              <li
                key={`gap-${index}`}
                aria-hidden
                className="grid h-8 w-8 place-items-center text-tertiary"
              >
                …
              </li>
            ) : (
              <li key={candidate}>
                <Link
                  href={hrefFor(candidate)}
                  aria-current={candidate === page ? "page" : undefined}
                  aria-label={t("pageNumber", { page: candidate })}
                  className={cn(
                    buttonVariants({
                      variant: candidate === page ? "primary" : "ghost",
                      size: "sm",
                    }),
                    "min-w-8 tabular-nums",
                  )}
                >
                  {candidate}
                </Link>
              </li>
            ),
          )}
        </ul>

        {page < pageCount ? (
          <Link
            href={hrefFor(page + 1)}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            {t("next")}
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
