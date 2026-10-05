import type { ReactNode } from "react";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

export const badgeVariants = cva(
  [
    "inline-flex items-center gap-1.5 rounded-sm border",
    "px-2 py-0.5 text-eyebrow uppercase",
    "whitespace-nowrap",
  ],
  {
    variants: {
      tone: {
        neutral: "bg-subtle text-secondary border-line",
        info: "bg-info-surface text-info border-info-line",
        success: "bg-success-surface text-success border-success-line",
        warning: "bg-warning-surface text-warning border-warning-line",
        danger: "bg-danger-surface text-danger border-danger-line",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps extends VariantProps<typeof badgeVariants> {
  children: ReactNode;
  className?: string;
  /**
   * Shows a leading status dot. Use for live state (a build in progress, a
   * deadline at risk) where the colour alone would be the only signal --
   * the dot gives the state a second, non-colour cue.
   */
  dot?: boolean;
  /** Animates the dot. For genuinely in-progress state only. */
  pulse?: boolean;
}

const DOT_TONE = {
  neutral: "bg-tertiary",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
} as const;

/**
 * Compact status label.
 *
 * Note the text is uppercased via CSS, not in the content, so translated
 * strings keep their original casing in the markup -- important for Arabic,
 * which has no case, and for French, where uppercasing can alter accents.
 */
export function Badge({
  children,
  className,
  tone = "neutral",
  dot = false,
  pulse = false,
}: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)}>
      {dot ? (
        <span className="relative flex size-1.5 shrink-0" aria-hidden>
          {pulse ? (
            <span
              className={cn(
                "absolute inset-0 animate-ping rounded-full opacity-75",
                DOT_TONE[tone ?? "neutral"],
              )}
            />
          ) : null}
          <span
            className={cn(
              "relative size-1.5 rounded-full",
              DOT_TONE[tone ?? "neutral"],
            )}
          />
        </span>
      ) : null}
      {children}
    </span>
  );
}
