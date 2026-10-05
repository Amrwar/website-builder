import { Container } from "@/components/layout/container";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

export interface PageSkeletonProps {
  /**
   * Optional status text. Omit it in a route-level `loading.tsx`: a Suspense
   * fallback must never suspend, and fetching a translation would do exactly
   * that. `aria-busy` carries the state on its own.
   */
  label?: string;
  /** Number of content blocks to outline below the heading. */
  blocks?: number;
}

/**
 * Loading placeholder.
 *
 * NOTE: do not reintroduce this as a route-group `loading.tsx`. Doing so on
 * `(marketing)` left `/configure` permanently in the Suspense fallback on
 * Next 16 + Turbopack: the page markup rendered, the fallback stayed mounted,
 * the tree was never committed, and every event handler beneath it silently
 * failed to attach -- with no error in dev or production. It reproduced with
 * a synchronous fallback and a synchronous page, so it is the boundary
 * itself, not an awaiting component.
 *
 * Use it inside an explicit `<Suspense>` around content that genuinely
 * streams instead. None of the marketing routes fetch at request time, so
 * none of them needed a route-level fallback.
 *
 * Mirrors the real page's rhythm -- eyebrow, heading, supporting line, then a
 * grid -- so the layout does not jump when content arrives. `aria-busy` on the
 * wrapper announces the loading state once, which is why the individual
 * skeleton shapes are hidden from assistive technology.
 */
export function PageSkeleton({ label, blocks = 3 }: PageSkeletonProps) {
  return (
    <Container
      width="wide"
      className="py-16 sm:py-24"
      aria-busy="true"
      // `status` only when there is something to announce; an unnamed live
      // region is noise to a screen reader.
      role={label ? "status" : undefined}
    >
      {label ? <span className="sr-only">{label}</span> : null}

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
