import { cn } from "@/lib/cn";

/**
 * One machine-readable value, isolated from the text around it.
 *
 * Numbers, references, slugs, prices and dates are Latin-script runs that keep
 * their internal left-to-right order no matter which direction the sentence
 * around them runs. `unicode-bidi: isolate` (see `[data-numeric]` in
 * `base.css`) is what gets that right, and it works **per element**: the
 * element takes its place in the parent's direction and decides its own
 * internal order.
 *
 * The consequence, and the reason this component exists rather than a bare
 * attribute: an element holding *two* values separated by a neutral character
 * is one isolated run, so in Arabic the bidi algorithm reorders its parts.
 * `SUB-2026-0001 · CA$199` rendered as `CA$ · SUB-2026-0001 199`. Each value
 * therefore gets its own element, and the separator stays in the parent's
 * direction where it belongs.
 *
 *     // Wrong -- one run holding two values.
 *     <span data-numeric>{reference} · {price}</span>
 *
 *     // Right -- the separator flows with the sentence.
 *     <span>
 *       <Numeric>{reference}</Numeric> · <Numeric>{price}</Numeric>
 *     </span>
 */
export function Numeric({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span data-numeric className={cn(className)}>
      {children}
    </span>
  );
}
