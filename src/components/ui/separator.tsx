import { cn } from "@/lib/cn";

export interface SeparatorProps {
  orientation?: "horizontal" | "vertical";
  /**
   * A separator that only groups content visually is decorative and must be
   * hidden from assistive technology; one that marks a genuine semantic break
   * should keep its role. Decorative is the right default.
   */
  decorative?: boolean;
  className?: string;
}

export function Separator({
  orientation = "horizontal",
  decorative = true,
  className,
}: SeparatorProps) {
  return (
    <div
      role={decorative ? "none" : "separator"}
      aria-orientation={decorative ? undefined : orientation}
      className={cn(
        "shrink-0 bg-line-subtle",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
    />
  );
}
