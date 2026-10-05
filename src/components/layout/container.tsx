import type { ElementType, HTMLAttributes } from "react";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

export const containerVariants = cva("mx-auto w-full", {
  variants: {
    width: {
      /** Reading measure for long-form copy -- caps line length, not pixels. */
      prose: "max-w-prose",
      /** Default page measure. */
      content: "max-w-content",
      /** Wide measure for dashboards, tables and grids. */
      wide: "max-w-wide",
      /** Edge to edge, gutters only. */
      full: "max-w-none",
    },
    gutter: {
      /** The single source of horizontal page padding across the product. */
      true: "px-5 sm:px-6 lg:px-8",
      false: "",
    },
  },
  defaultVariants: { width: "content", gutter: true },
});

export interface ContainerProps
  extends
    Omit<HTMLAttributes<HTMLElement>, "className">,
    VariantProps<typeof containerVariants> {
  as?: ElementType;
  className?: string;
}

/**
 * Horizontal measure and gutters.
 *
 * Every page-level width decision goes through here. Hard-coding `max-w-*` in
 * a page is what makes a product drift out of alignment column by column.
 */
export function Container({
  as: Tag = "div",
  className,
  width,
  gutter,
  ...props
}: ContainerProps) {
  return (
    <Tag className={cn(containerVariants({ width, gutter }), className)} {...props} />
  );
}
