import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Timeline.
 *
 * A chronological record of what happened: the Build Room's project history,
 * where a stepper would be wrong because these events are not a fixed sequence
 * and cannot be "upcoming".
 *
 * The rail and dots are decorative; the content is an ordered list, which is
 * what conveys sequence to a screen reader. Timestamps use `<time dateTime>`
 * so the machine-readable value survives whatever human format is displayed.
 */

export type TimelineTone = "neutral" | "accent" | "success" | "warning" | "danger";

const DOT_TONE: Record<TimelineTone, string> = {
  neutral: "bg-tertiary",
  accent: "bg-action-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

export interface TimelineEntry {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  /** ISO 8601 instant. */
  dateTime: string;
  /** Formatted for display; the ISO value stays in the `datetime` attribute. */
  displayTime: ReactNode;
  tone?: TimelineTone;
  /** Marks an entry still in progress. */
  active?: boolean;
}

export interface TimelineProps {
  entries: TimelineEntry[];
  className?: string;
}

export function Timeline({ entries, className }: TimelineProps) {
  return (
    <ol className={cn("flex flex-col", className)}>
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1;
        const tone = entry.tone ?? "neutral";

        return (
          <li key={entry.id} className="flex gap-4">
            {/* Rail column */}
            <div className="flex flex-col items-center" aria-hidden>
              <span className="relative flex size-2.5 shrink-0 items-center justify-center">
                {entry.active ? (
                  <span
                    className={cn(
                      "absolute inline-flex size-2.5 animate-ping rounded-full opacity-60",
                      DOT_TONE[tone],
                    )}
                  />
                ) : null}
                <span className={cn("relative size-2.5 rounded-full", DOT_TONE[tone])} />
              </span>
              {isLast ? null : <span className="w-px flex-1 bg-line" />}
            </div>

            <div className={cn("flex min-w-0 flex-col gap-1", isLast ? "pb-0" : "pb-6")}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="text-body-sm font-medium text-primary">
                  {entry.title}
                </span>
                <time
                  dateTime={entry.dateTime}
                  className="text-caption text-tertiary tabular-nums"
                >
                  {entry.displayTime}
                </time>
              </div>
              {entry.description ? (
                <p className="text-body-sm text-secondary">{entry.description}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
