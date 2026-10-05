import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { StatusIndicator, type StatusTone } from "@/components/ui/status-indicator";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/**
 * Project card.
 *
 * Used on the public build wall and in the customer dashboard. Both show the
 * same facts -- what was built, under which scope, and how long it took -- so
 * they share one component rather than drifting into two.
 *
 * When `href` is present the whole card is a link, implemented by stretching
 * the anchor across the card rather than nesting interactive elements inside
 * one another. That keeps a single tab stop and a single announced name, where
 * a card wrapped in an anchor would read its entire contents as the link text.
 */

export interface ProjectCardProps {
  title: ReactNode;
  /** Build type, e.g. "Website". */
  buildType: ReactNode;
  /** Scope tier, e.g. "5-Day Build". */
  scopeTier?: ReactNode;
  status?: { tone: StatusTone; label: ReactNode; pulse?: boolean };
  /** Delivery fact, e.g. "Delivered in 4 days". */
  delivery?: ReactNode;
  /** Thumbnail or preview slot. Decorative. */
  media?: ReactNode;
  href?: string;
  className?: string;
}

export function ProjectCard({
  title,
  buildType,
  scopeTier,
  status,
  delivery,
  media,
  href,
  className,
}: ProjectCardProps) {
  return (
    <Card
      padding="none"
      interactive={href ? true : undefined}
      className={cn("group relative flex flex-col overflow-hidden", className)}
    >
      {media ? (
        <div
          aria-hidden
          className="aspect-16/10 w-full overflow-hidden border-b border-line-subtle bg-sunken"
        >
          {media}
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-body font-semibold text-primary">
            {href ? (
              <Link
                href={href}
                // Stretches the hit area over the whole card while keeping the
                // accessible name limited to the title.
                className="after:absolute after:inset-0 after:content-['']"
              >
                {title}
              </Link>
            ) : (
              title
            )}
          </h3>
          <Badge tone="neutral">{buildType}</Badge>
        </div>

        {scopeTier ? <p className="text-body-sm text-secondary">{scopeTier}</p> : null}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
          {status ? (
            <StatusIndicator tone={status.tone} pulse={status.pulse}>
              {status.label}
            </StatusIndicator>
          ) : (
            <span />
          )}
          {delivery ? (
            <span className="text-caption text-tertiary tabular-nums">{delivery}</span>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
