import { Container } from "@/components/layout/container";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

export interface PageSkeletonProps {
  /** Accessible status text announced while the page loads. */
  label: string;
  /** Number of content blocks to outline below the heading. */
  blocks?: number;
}

/**
 * Route-level loading placeholder.
 *
 * Mirrors the real page's rhythm -- eyebrow, heading, supporting line, then a
 * grid -- so the layout does not jump when content arrives. `aria-busy` on the
 * wrapper announces the loading state once, which is why the individual
 * skeleton shapes are hidden from assistive technology.
 */
export function PageSkeleton({ label, blocks = 3 }: PageSkeletonProps) {
  return (
    <Container width="wide" className="py-16 sm:py-24" aria-busy="true" role="status">
      <span className="sr-only">{label}</span>

      <div className="flex max-w-3xl flex-col gap-5">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-12 w-full max-w-xl" />
        <SkeletonText lines={2} className="max-w-lg" />
      </div>

      <div className="mt-14 grid gap-5 lg:grid-cols-3">
        {Array.from({ length: blocks }, (_, index) => (
          <div
            key={index}
            className="flex flex-col gap-4 rounded-lg border border-line p-6"
          >
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-9 w-24" />
            <SkeletonText lines={2} />
          </div>
        ))}
      </div>
    </Container>
  );
}
