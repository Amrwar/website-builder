import type { HTMLAttributes, ReactNode } from "react";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

export const cardVariants = cva(["rounded-lg", "transition-colors duration-base ease-out-quint"], {
  variants: {
    /**
     * Structure comes from hairline borders rather than shadows -- shadows are
     * reserved for genuine overlays (dialogs, popovers), so a page of cards
     * reads as a flat grid instead of a pile of floating slabs.
     */
    surface: {
      outlined: "border border-line bg-canvas",
      subtle: "border border-line-subtle bg-subtle",
      sunken: "bg-sunken",
      /** For a dialog or popover, where elevation is meaningful. */
      raised: "border border-line-subtle bg-raised shadow-md",
    },
    padding: {
      none: "",
      sm: "p-4",
      md: "p-5 sm:p-6",
      lg: "p-6 sm:p-8",
    },
    /** Adds hover affordance. Only for cards that are themselves a link/button. */
    interactive: {
      true: "hover:border-line-strong hover:bg-hover cursor-pointer",
    },
  },
  defaultVariants: { surface: "outlined", padding: "md" },
});

export interface CardProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "className">,
    VariantProps<typeof cardVariants> {
  className?: string;
}

export function Card({ className, surface, padding, interactive, ...props }: CardProps) {
  return (
    <div
      className={cn(cardVariants({ surface, padding, interactive }), className)}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { className?: string }) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

export function CardTitle({
  className,
  as: Tag = "h3",
  children,
}: {
  className?: string;
  as?: "h2" | "h3" | "h4";
  children: ReactNode;
}) {
  return (
    <Tag className={cn("text-display-sm text-primary", className)}>{children}</Tag>
  );
}

export function CardDescription({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <p className={cn("text-body-sm text-secondary", className)}>{children}</p>;
}

export function CardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { className?: string }) {
  return <div className={cn("text-body-sm text-secondary", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)} {...props} />
  );
}
