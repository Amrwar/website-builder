import { notFound } from "next/navigation";

/**
 * Catch-all for unmatched paths inside a locale.
 *
 * Next.js only falls back to the *root* not-found for a URL that matches no
 * route at all; a nested `not-found.tsx` is reached only when `notFound()` is
 * called within its subtree. Without this route, every mistyped URL rendered
 * the framework's unstyled, untranslated default page instead of ours.
 *
 * Explicit routes take precedence over a catch-all, so adding real pages here
 * later needs no change.
 */
export default function CatchAllNotFound(): never {
  notFound();
}
