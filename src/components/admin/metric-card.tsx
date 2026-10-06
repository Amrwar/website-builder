import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

/**
 * A single figure.
 *
 * The dashboard is built from these rather than from charts, because almost
 * every number on it is a count with no time series behind it yet. A sparkline
 * drawn from four data points is decoration pretending to be insight, and the
 * brief asked specifically not to do that.
 *
 * `tone` is used sparingly: only for figures where a non-zero value is itself
 * the alert -- overdue, at risk. Colouring every tile would make none of them
 * mean anything.
 */
export function MetricCard({
  label,
  value,
  hint,
  tone = "neutral",
  href,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "warning" | "danger";
  href?: string;
  children?: ReactNode;
}) {
  const body = (
    <Card
      padding="md"
      className={cn(
        "flex h-full flex-col gap-1.5",
        href && "duration-fast transition-colors ease-out-quint hover:bg-hover",
        tone === "warning" && "border-warning",
        tone === "danger" && "border-danger",
      )}
    >
      <p className="text-eyebrow text-tertiary uppercase">{label}</p>
      <p
        className={cn(
          "text-display-sm",
          tone === "danger"
            ? "text-danger"
            : tone === "warning"
              ? "text-warning"
              : "text-primary",
        )}
        data-numeric
      >
        {value}
      </p>
      {hint ? <p className="text-caption text-tertiary">{hint}</p> : null}
      {children}
    </Card>
  );

  return body;
}

/** A labelled bar, for a proportion that genuinely has two parts. */
export function MetricBar({
  label,
  value,
  total,
  caption,
}: {
  label: string;
  value: number;
  total: number;
  caption?: string;
}) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <Card padding="md" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-eyebrow text-tertiary uppercase">{label}</p>
        <p className="text-body font-medium text-primary" data-numeric>
          {percent}%
        </p>
      </div>

      <div
        className="h-1.5 overflow-hidden rounded-full bg-subtle"
        role="img"
        aria-label={`${percent}%`}
      >
        {/* Logical sizing, so the bar fills from the right in Arabic.
            `translateX` does not mirror and would fill the wrong way. */}
        <div
          className="h-full rounded-full bg-action-accent"
          style={{ inlineSize: `${percent}%` }}
        />
      </div>

      {caption ? <p className="text-caption text-tertiary">{caption}</p> : null}
    </Card>
  );
}
