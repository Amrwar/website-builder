import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  /** What is missing, stated plainly. Not "No data". */
  title: ReactNode;
  /** Why it is empty and what to do about it. */
  description?: ReactNode;
  /** The action that resolves the emptiness. */
  action?: ReactNode;
  /** Decorative mark. Kept optional -- most empty states read better without. */
  icon?: ReactNode;
  className?: string;
  size?: "sm" | "md";
}

/**
 * Empty state.
 *
 * Every collection surface in the product routes through this so an empty
 * dashboard, an empty build wall and an empty file list are recognisably the
 * same thing. The contract is that the copy names the next action rather than
 * merely reporting absence.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
  size = "md",
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        "rounded-lg border border-dashed border-line",
        size === "md" ? "gap-3 px-6 py-14" : "gap-2 px-4 py-9",
        className,
      )}
    >
      {icon ? (
        <span aria-hidden className="mb-1 text-tertiary">
          {icon}
        </span>
      ) : null}
      <p
        className={cn(
          "text-primary font-medium",
          size === "md" ? "text-display-sm" : "text-body",
        )}
      >
        {title}
      </p>
      {description ? (
        <p className="max-w-sm text-body-sm text-secondary">{description}</p>
      ) : null}
      {action ? <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
