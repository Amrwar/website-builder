"use client";

import type { ReactNode } from "react";

import * as RadixTooltip from "@radix-ui/react-tooltip";

import { cn } from "@/lib/cn";

/**
 * Tooltip.
 *
 * Supplementary only. A tooltip is unavailable to touch users, so anything
 * essential belongs in visible text or in a field description instead. The
 * right use is naming an icon-only control or expanding an abbreviation.
 *
 * Radix shows it on focus as well as hover, which is what makes an icon-only
 * button explicable to a keyboard user.
 */

/**
 * Wrap the application once. The shared provider is what lets the second
 * tooltip in a group appear instantly instead of re-waiting the open delay.
 */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={300} skipDelayDuration={200}>
      {children}
    </RadixTooltip.Provider>
  );
}

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  /** Open state for a tooltip that should also work on touch, via tap. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Tooltip({
  content,
  children,
  side = "top",
  open,
  onOpenChange,
}: TooltipProps) {
  return (
    <RadixTooltip.Root open={open} onOpenChange={onOpenChange}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            "z-50 max-w-64 rounded-md px-2.5 py-1.5",
            "bg-inverse text-caption text-fg-inverse shadow-md",
            "data-[state=closed]:animate-fade-out data-[state=delayed-open]:animate-fade-in",
          )}
        >
          {content}
          <RadixTooltip.Arrow className="fill-inverse" width={10} height={5} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
