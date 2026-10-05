"use client";

import * as RadixProgress from "@radix-ui/react-progress";

import { cn } from "@/lib/cn";

/**
 * Progress bar.
 *
 * Determinate by default. Pass `value={null}` for indeterminate work, which
 * Radix marks correctly so assistive technology announces "busy" rather than
 * reading a meaningless percentage.
 *
 * The tone exists for the build countdown: a deadline that is on track, at
 * risk, or missed is the same measurement with different consequences, and
 * the colour is always accompanied by the label text so it is not the only
 * signal.
 */

export type ProgressTone = "neutral" | "accent" | "warning" | "danger" | "success";

const TONE: Record<ProgressTone, string> = {
  neutral: "bg-action",
  accent: "bg-action-accent",
  warning: "bg-warning",
  danger: "bg-danger",
  success: "bg-success",
};

export interface ProgressProps {
  /** 0–100, or null for indeterminate. */
  value: number | null;
  /** Accessible name, e.g. "Build progress". */
  label: string;
  /** Visible text shown above the track. */
  caption?: React.ReactNode;
  /** Visible value text, e.g. "3 of 5 days". */
  valueText?: string;
  tone?: ProgressTone;
  size?: "sm" | "md";
  className?: string;
}

export function Progress({
  value,
  label,
  caption,
  valueText,
  tone = "neutral",
  size = "md",
  className,
}: ProgressProps) {
  const clamped = value === null ? null : Math.min(100, Math.max(0, value));

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {caption || valueText ? (
        <div className="flex items-baseline justify-between gap-4">
          {caption ? <span className="text-body-sm text-primary">{caption}</span> : null}
          {valueText ? (
            <span className="text-caption text-secondary tabular-nums">{valueText}</span>
          ) : null}
        </div>
      ) : null}

      <RadixProgress.Root
        value={clamped}
        max={100}
        aria-label={label}
        // Lets a screen reader announce "3 of 5 days" instead of "60 percent".
        aria-valuetext={valueText}
        className={cn(
          "relative w-full overflow-hidden rounded-full bg-sunken",
          size === "sm" ? "h-1" : "h-2",
        )}
      >
        <RadixProgress.Indicator
          className={cn(
            "h-full rounded-full",
            "duration-slow transition-[inline-size] ease-out-quint",
            clamped === null && "animate-pulse",
            TONE[tone],
          )}
          // Sized with the logical `inline-size` rather than a transform:
          // `translateX` does not mirror under RTL, so a transform-driven bar
          // fills from the wrong edge in Arabic.
          style={{ inlineSize: `${clamped ?? 100}%` }}
        />
      </RadixProgress.Root>
    </div>
  );
}
