import type { ReactNode } from "react";

import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * Error state.
 *
 * The counterpart to `EmptyState`: that one means "nothing here yet", this one
 * means "something failed". Conflating them is how users end up being told
 * they have no projects when the request simply errored.
 *
 * Carries a retry action because most failures at this level are transient,
 * and optionally a reference id -- the correlation id from the API envelope --
 * so a support conversation can start from a fact rather than a description.
 */
export interface ErrorStateProps {
  title: ReactNode;
  description?: ReactNode;
  /** Retry or escape action. */
  action?: ReactNode;
  /** Correlation id, shown in monospace for accurate reading aloud. */
  reference?: string;
  className?: string;
  size?: "sm" | "md";
}

export function ErrorState({
  title,
  description,
  action,
  reference,
  className,
  size = "md",
}: ErrorStateProps) {
  return (
    <div
      // Assertive: an error state replaces content the user asked for.
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-center",
        "rounded-lg border border-danger-line bg-danger-surface",
        size === "md" ? "px-6 py-14" : "px-4 py-9",
        className,
      )}
    >
      <AlertTriangle className="size-5 text-danger" aria-hidden />
      <p
        className={cn(
          "font-medium text-primary",
          size === "md" ? "text-display-sm" : "text-body",
        )}
      >
        {title}
      </p>
      {description ? (
        <p className="max-w-sm text-body-sm text-secondary">{description}</p>
      ) : null}
      {reference ? (
        <p className="font-mono text-caption text-tertiary" data-numeric>
          {reference}
        </p>
      ) : null}
      {action ? (
        <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}
