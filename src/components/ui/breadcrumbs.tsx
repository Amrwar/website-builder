import type { ReactNode } from "react";

import { ChevronRight } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/**
 * Breadcrumbs.
 *
 * An ordered list inside a labelled `<nav>`: the order is meaningful, and the
 * landmark label distinguishes it from other navigation on the page.
 *
 * The last item is the current page. It is not a link -- a link to where you
 * already are is noise -- and carries `aria-current="page"`. Separators are
 * `aria-hidden` so the trail is not read as "Home chevron Builds chevron".
 */

export interface Crumb {
  label: ReactNode;
  /** Omit on the final item, which is the current page. */
  href?: string;
}

export interface BreadcrumbsProps {
  items: Crumb[];
  /** Accessible name for the nav landmark. */
  label: string;
  className?: string;
}

export function Breadcrumbs({ items, label, className }: BreadcrumbsProps) {
  return (
    <nav aria-label={label} className={cn(className)}>
      <ol className="flex flex-wrap items-center gap-1.5 text-body-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={index} className="flex items-center gap-1.5">
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="duration-fast rounded-sm text-secondary transition-colors ease-out-quint hover:text-primary"
                >
                  {item.label}
                </Link>
              ) : (
                <span aria-current={isLast ? "page" : undefined} className="text-primary">
                  {item.label}
                </span>
              )}
              {isLast ? null : (
                <ChevronRight
                  className="rtl-flip size-3.5 shrink-0 text-tertiary"
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
