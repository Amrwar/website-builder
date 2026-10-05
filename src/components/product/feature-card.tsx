import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { Icon, type IconComponent } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/**
 * Feature card.
 *
 * A single capability or benefit. Deliberately plain: an icon, a heading and a
 * line of copy. Feature grids are where marketing pages usually acquire
 * gradients and oversized rounding, and the result reads as decoration rather
 * than information.
 *
 * The icon is decorative -- the heading beside it already names the feature --
 * so it is hidden from assistive technology.
 */
export interface FeatureCardProps {
  icon?: IconComponent;
  title: ReactNode;
  description: ReactNode;
  /** Optional trailing link or action. */
  action?: ReactNode;
  /** `h3` by default; change when the surrounding heading level differs. */
  as?: "h2" | "h3" | "h4";
  className?: string;
}

export function FeatureCard({
  icon,
  title,
  description,
  action,
  as: Tag = "h3",
  className,
}: FeatureCardProps) {
  return (
    <Card padding="lg" className={cn("flex flex-col gap-3", className)}>
      {icon ? <Icon icon={icon} size="lg" className="text-secondary" /> : null}
      <Tag className="text-body font-semibold text-primary">{title}</Tag>
      <p className="flex-1 text-body-sm text-secondary">{description}</p>
      {action ? <div className="pt-1">{action}</div> : null}
    </Card>
  );
}
