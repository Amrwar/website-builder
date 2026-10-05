import type { HTMLAttributes, ReactNode } from "react";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

export const sectionVariants = cva("", {
  variants: {
    /**
     * Vertical rhythm. A fixed set of steps, so the page reads as a measured
     * sequence rather than a run of arbitrary paddings.
     */
    space: {
      sm: "py-10 sm:py-12",
      md: "py-14 sm:py-20",
      lg: "py-20 sm:py-28",
      xl: "py-24 sm:py-36",
    },
    surface: {
      none: "",
      subtle: "bg-subtle",
      sunken: "bg-sunken",
      inverse: "bg-inverse text-fg-inverse",
    },
    /** Hairline rule at the top edge, for a quiet Swiss register mark. */
    divided: {
      true: "border-t border-line-subtle",
    },
  },
  defaultVariants: { space: "md", surface: "none" },
});

export interface SectionProps
  extends Omit<HTMLAttributes<HTMLElement>, "className">,
    VariantProps<typeof sectionVariants> {
  className?: string;
}

export function Section({ className, space, surface, divided, ...props }: SectionProps) {
  return (
    <section
      className={cn(sectionVariants({ space, surface, divided }), className)}
      {...props}
    />
  );
}

export interface SectionHeadingProps {
  /** Uppercase micro-label naming the section. */
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Trailing action, e.g. "View all". */
  action?: ReactNode;
  /** `h2` for a page section, `h3` when nested. */
  as?: "h2" | "h3";
  align?: "start" | "center";
  className?: string;
}

/**
 * Section header: eyebrow, title, supporting line.
 *
 * Shared so that heading sizes and the eyebrow-to-title spacing are identical
 * on every section of every page.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  as: Tag = "h2",
  align = "start",
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        align === "center" && "sm:flex-col sm:items-center",
        className,
      )}
    >
      <div
        className={cn(
          "flex max-w-2xl flex-col gap-3",
          align === "center" && "items-center text-center",
        )}
      >
        {eyebrow ? (
          <p className="text-eyebrow uppercase text-tertiary">{eyebrow}</p>
        ) : null}
        <Tag className="text-display-lg text-primary">{title}</Tag>
        {description ? (
          <p className="text-body-lg text-secondary">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
