"use client";

import * as RadixTabs from "@radix-ui/react-tabs";

import { useDirection } from "@/components/ui/use-direction";

import { cn } from "@/lib/cn";

/**
 * Tabs.
 *
 * Radix provides roving focus: Tab enters the list once, then arrow keys move
 * between tabs and Home/End jump to the ends. Hand-rolled tab strips normally
 * make every tab a tab stop, which turns a ten-tab interface into ten presses.
 *
 * Direction-aware: the arrow keys reverse under RTL -- but only because the
 * direction is passed in below. Radix does *not* read it from the document.
 *
 * Selection is marked by an underline rather than a filled pill, so a tab
 * strip sits quietly under a heading instead of competing with it.
 */

/**
 * Wrapped rather than re-exported so the page's direction reaches Radix. See
 * `useDirection` for why Radix does not pick it up on its own. An explicit
 * `dir` still wins, for the rare component that must not mirror.
 */
export function Tabs({ dir, ...props }: React.ComponentProps<typeof RadixTabs.Root>) {
  const direction = useDirection();
  return <RadixTabs.Root dir={dir ?? direction} {...props} />;
}

export function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      className={cn(
        "flex items-center gap-1 border-b border-line-subtle",
        // Many tabs on a phone scroll rather than wrap or shrink to illegible.
        "overflow-x-auto",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cn(
        "relative -mb-px shrink-0 border-b-2 border-transparent whitespace-nowrap",
        "px-3 py-2.5 text-body-sm text-secondary",
        "duration-fast transition-colors ease-out-quint",
        "hover:text-primary",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        "data-[state=active]:border-action data-[state=active]:font-medium data-[state=active]:text-primary",
        "disabled:pointer-events-none disabled:text-fg-disabled",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof RadixTabs.Content>) {
  return (
    <RadixTabs.Content
      className={cn(
        "pt-6",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        className,
      )}
      {...props}
    />
  );
}
