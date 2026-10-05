import type { ComponentType, SVGProps } from "react";

import { cn } from "@/lib/cn";

/**
 * Iconography.
 *
 * One icon set (Lucide), one stroke weight, four sizes. Icons are drawn on a
 * 24px grid with a 2px stroke, so rendering them at arbitrary sizes thins or
 * thickens the line relative to surrounding text and the set stops looking
 * like a set. These sizes are the ones that stay optically consistent.
 *
 * Accessibility rule, enforced by the API: an icon is either decorative
 * (hidden, because adjacent text already says it) or it is the only label
 * present (given a `label`). There is no third case, and defaulting to
 * decorative is right because most icons sit beside their own text.
 */

export type IconSize = "xs" | "sm" | "md" | "lg";

const SIZE: Record<IconSize, string> = {
  /** Inline with caption text. */
  xs: "size-3.5",
  /** Default: inline with body text and inside buttons. */
  sm: "size-4",
  /** Standalone affordances, icon-only buttons. */
  md: "size-5",
  /** Feature marks and empty states. */
  lg: "size-6",
};

/** Lucide's component shape, without depending on its exported type. */
export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export interface IconProps {
  icon: IconComponent;
  size?: IconSize;
  /**
   * Accessible name. Provide it only when the icon carries meaning no
   * adjacent text conveys; omitting it marks the icon decorative.
   */
  label?: string;
  className?: string;
}

export function Icon({ icon: Component, size = "sm", label, className }: IconProps) {
  return (
    <Component
      className={cn("shrink-0", SIZE[size], className)}
      strokeWidth={2}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      focusable="false"
    />
  );
}
