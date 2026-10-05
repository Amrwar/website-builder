import type {
  HTMLAttributes,
  ReactNode,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";

import { cn } from "@/lib/cn";

/**
 * Data table.
 *
 * A real `<table>`, not a grid of divs: the element carries row and column
 * relationships that screen readers use to announce "column 3 of 5, Status"
 * when moving between cells. Rebuilding that with ARIA is possible and almost
 * always done incompletely.
 *
 * On narrow screens the table scrolls horizontally rather than collapsing into
 * stacked cards, because comparison across rows is the reason a table was
 * chosen. The scroll container is focusable so it can be reached and scrolled
 * by keyboard, which an overflow container otherwise cannot.
 */

export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  /** Names the scrollable region; required for the keyboard scroll affordance. */
  label: string;
  /** Rendered as a <caption>; use when the table needs explaining. */
  caption?: ReactNode;
  className?: string;
}

export function Table({ label, caption, className, children, ...props }: TableProps) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn(
        "w-full overflow-x-auto rounded-lg border border-line",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
      )}
    >
      <table className={cn("w-full border-collapse text-body-sm", className)} {...props}>
        {caption ? (
          <caption className="px-4 py-3 text-start text-caption text-secondary">
            {caption}
          </caption>
        ) : null}
        {children}
      </table>
    </div>
  );
}

export function TableHeader({
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-subtle", className)} {...props} />;
}

export function TableBody({
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-line-subtle", className)} {...props} />;
}

export function TableRow({
  className,
  interactive = false,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }) {
  return (
    <tr
      className={cn(
        "duration-fast transition-colors ease-out-quint",
        interactive && "cursor-pointer hover:bg-hover",
        className,
      )}
      {...props}
    />
  );
}

export interface TableHeadProps extends ThHTMLAttributes<HTMLTableCellElement> {
  /** Right-align numeric columns so digits line up on the decimal. */
  numeric?: boolean;
}

export function TableHead({ className, numeric = false, ...props }: TableHeadProps) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-3 text-start text-eyebrow font-medium text-tertiary uppercase",
        "border-b border-line",
        numeric && "text-end",
        className,
      )}
      {...props}
    />
  );
}

export interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
}

export function TableCell({ className, numeric = false, ...props }: TableCellProps) {
  return (
    <td
      className={cn(
        "px-4 py-3 text-secondary",
        // Tabular figures keep columns of numbers aligned as values change.
        numeric && "text-end tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

/** Row header: the cell that identifies its row, announced as such. */
export function TableRowHeader({
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="row"
      className={cn("px-4 py-3 text-start font-medium text-primary", className)}
      {...props}
    />
  );
}

/** Full-width message row, for an empty or error state inside a table. */
export function TableMessageRow({
  colSpan,
  children,
}: {
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-4 py-12 text-center text-body-sm text-secondary"
      >
        {children}
      </td>
    </tr>
  );
}
