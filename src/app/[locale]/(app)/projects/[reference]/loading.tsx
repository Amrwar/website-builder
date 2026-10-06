import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Build Room loading state.
 *
 * The room assembles nine panels from a single server query, so there is a
 * real wait worth filling. The skeleton mirrors the page's actual shape --
 * header, tab strip, two summary cards -- rather than showing a spinner, so
 * the layout does not jump when the content arrives.
 *
 * ── A caution, learned the hard way ───────────────────────────────────────
 * A `loading.tsx` added to a **route group** once left a segment permanently
 * suspended, with no error in dev or production: the page simply never
 * appeared. This file sits on a concrete route rather than a group, and it was
 * verified in a browser before being committed. Do not move it up into
 * `(app)/` without checking the same thing again.
 * ──────────────────────────────────────────────────────────────────────────
 */
export default function BuildRoomLoading() {
  return (
    <Container width="content" className="py-10 sm:py-14">
      <div className="mb-8 flex flex-col gap-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-56" />
      </div>

      <Skeleton className="h-10 w-full" />

      <div className="mt-6 flex flex-col gap-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      </div>

      <span className="sr-only" role="status">
        Loading
      </span>
    </Container>
  );
}
