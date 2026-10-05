import type { ReactNode } from "react";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

export const calloutVariants = cva(
  "flex gap-3 rounded-md border px-4 py-3 text-body-sm",
  {
    variants: {
      tone: {
        info: "border-info-line bg-info-surface text-info",
        success: "border-success-line bg-success-surface text-success",
        warning: "border-warning-line bg-warning-surface text-warning",
        danger: "border-danger-line bg-danger-surface text-danger",
        neutral: "border-line bg-subtle text-secondary",
      },
    },
    defaultVariants: { tone: "info" },
  },
);

const GLYPH: Record<NonNullable<CalloutProps["tone"]>, string> = {
  info: "i",
  success: "✓",
  warning: "!",
  danger: "!",
  neutral: "i",
};

export interface CalloutProps extends VariantProps<typeof calloutVariants> {
  title?: ReactNode;
  children?: ReactNode;
  /** Trailing action, e.g. a retry button on an error callout. */
  action?: ReactNode;
  className?: string;
  /**
   * Announce the message when it appears. Use for messages that result from a
   * user action (a failed submit, a saved change) rather than for static
   * explanatory notes, which should not interrupt a screen reader.
   */
  live?: boolean;
}

/**
 * Inline message block: the shared surface for error, success, warning and
 * informational states across the product.
 *
 * Carries a glyph alongside the colour so the tone survives greyscale,
 * low-vision and colour-blind viewing -- colour is never the only signal.
 */
export function Callout({
  tone,
  title,
  children,
  action,
  className,
  live = false,
}: CalloutProps) {
  // `VariantProps` admits `null` as well as `undefined`, which a default
  // parameter value would not cover.
  const activeTone = tone ?? "info";

  return (
    <div
      className={cn(calloutVariants({ tone: activeTone }), className)}
      role={live ? "status" : undefined}
      aria-live={live ? (activeTone === "danger" ? "assertive" : "polite") : undefined}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full",
          "border border-current text-[0.625rem] leading-none font-semibold",
        )}
      >
        {GLYPH[activeTone]}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title ? <p className="font-medium text-primary">{title}</p> : null}
        {children ? <div className="text-secondary">{children}</div> : null}
        {action ? <div className="mt-1 flex gap-2">{action}</div> : null}
      </div>
    </div>
  );
}
