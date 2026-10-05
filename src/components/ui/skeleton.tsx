import { cn } from "@/lib/cn";

export interface SkeletonProps {
  className?: string;
}

/**
 * Loading placeholder.
 *
 * Deliberately a quiet pulse rather than a travelling shimmer gradient: a
 * shimmer draws the eye to what is not there yet. Shapes should mirror the
 * real content's dimensions so there is no reflow when data lands.
 *
 * Marked `aria-hidden` -- the loading state is announced once by the
 * container's `aria-busy`, not by every placeholder block.
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div aria-hidden className={cn("animate-pulse rounded-sm bg-sunken", className)} />
  );
}

export interface SkeletonTextProps {
  /** Number of lines to render. */
  lines?: number;
  className?: string;
}

/**
 * Multi-line text placeholder. The last line is shortened so the block reads
 * as a paragraph rather than a solid rectangle.
 */
export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className={cn("h-3.5", index === lines - 1 && lines > 1 && "w-3/5")}
        />
      ))}
    </div>
  );
}
