import { cn } from "@/lib/cn";

/**
 * Status indicator.
 *
 * A dot plus its label. Distinct from `Badge`, which is a bordered chip for
 * categorisation; this is for live state -- a build in progress, a deadline at
 * risk, a deployment healthy.
 *
 * The label is always rendered. Colour alone fails for the ~8% of men with a
 * colour vision deficiency, and a bare dot is unreadable to a screen reader,
 * so the text is the signal and the dot is reinforcement.
 */

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

const DOT: Record<StatusTone, string> = {
  neutral: "bg-tertiary",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

const TEXT: Record<StatusTone, string> = {
  neutral: "text-secondary",
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

export interface StatusIndicatorProps {
  tone?: StatusTone;
  children: React.ReactNode;
  /** Animates the dot. Reserve for genuinely ongoing state. */
  pulse?: boolean;
  /** Colour the label too. Off by default so status rows stay quiet. */
  emphasis?: boolean;
  className?: string;
}

export function StatusIndicator({
  tone = "neutral",
  children,
  pulse = false,
  emphasis = false,
  className,
}: StatusIndicatorProps) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-body-sm", className)}>
      <span className="relative flex size-2 shrink-0" aria-hidden>
        {pulse ? (
          <span
            className={cn(
              "absolute inset-0 animate-ping rounded-full opacity-70",
              DOT[tone],
            )}
          />
        ) : null}
        <span className={cn("relative size-2 rounded-full", DOT[tone])} />
      </span>
      <span className={emphasis ? TEXT[tone] : "text-secondary"}>{children}</span>
    </span>
  );
}
