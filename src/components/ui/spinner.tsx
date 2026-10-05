import { cn } from "@/lib/cn";

const SIZES = {
  sm: "size-3.5 border-[1.5px]",
  md: "size-4 border-2",
  lg: "size-6 border-2",
} as const;

export interface SpinnerProps {
  size?: keyof typeof SIZES;
  className?: string;
  /**
   * Accessible label. Omit when the spinner sits inside an element that already
   * announces the busy state (a button with `aria-busy`, for example) -- the
   * spinner is then decorative and announcing it twice is noise.
   */
  label?: string;
}

/**
 * Indeterminate progress indicator.
 *
 * Rendered as a bordered ring rather than an SVG so it inherits `currentColor`
 * and needs no fill/stroke plumbing per usage.
 */
export function Spinner({ size = "md", className, label }: SpinnerProps) {
  return (
    <span
      className={cn(
        "inline-block shrink-0 animate-spin rounded-full",
        "border-current border-e-transparent",
        SIZES[size],
        className,
      )}
      role={label ? "status" : undefined}
      aria-hidden={label ? undefined : true}
    >
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
