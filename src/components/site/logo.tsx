import { BRAND } from "@/config/brand";
import { cn } from "@/lib/cn";

export interface LogoProps {
  className?: string;
  /** Hides the wordmark, leaving the mark alone. For tight surfaces. */
  markOnly?: boolean;
}

/**
 * Wordmark.
 *
 * The mark is a production grid with one cell filled -- a build occupying a
 * slot on the line. Drawn with `currentColor` so it inverts with the theme
 * and needs no light/dark asset pair.
 */
export function Logo({ className, markOnly = false }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        viewBox="0 0 16 16"
        className="size-4 shrink-0"
        fill="none"
        aria-hidden
        focusable="false"
      >
        <rect x="0.75" y="0.75" width="6" height="6" stroke="currentColor" strokeWidth="1.5" />
        <rect x="9.25" y="0.75" width="6" height="6" stroke="currentColor" strokeWidth="1.5" />
        <rect x="0.75" y="9.25" width="6" height="6" stroke="currentColor" strokeWidth="1.5" />
        <rect x="9.25" y="9.25" width="6" height="6" fill="currentColor" />
      </svg>
      {markOnly ? (
        <span className="sr-only">{BRAND.name}</span>
      ) : (
        <span className="text-body font-semibold tracking-[-0.02em]">{BRAND.name}</span>
      )}
    </span>
  );
}
