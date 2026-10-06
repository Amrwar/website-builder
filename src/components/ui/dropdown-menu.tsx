"use client";

import * as RadixMenu from "@radix-ui/react-dropdown-menu";

import { useDirection } from "@/components/ui/use-direction";
import { Check } from "lucide-react";

import { cn } from "@/lib/cn";
import { OVERLAY_ITEM, OVERLAY_LABEL, OVERLAY_PANEL } from "./overlay-styles";

/**
 * Dropdown menu.
 *
 * For actions, not for choosing a value -- a menu that sets a form value
 * should be a `Select`, which carries the right role and participates in the
 * form. Radix supplies type-ahead, arrow-key navigation, Escape to close and
 * focus return.
 */

/**
 * Wrapped rather than re-exported so the page's direction reaches Radix. See
 * `useDirection` for why Radix does not pick it up on its own. An explicit
 * `dir` still wins, for the rare component that must not mirror.
 */
export function DropdownMenu({
  dir,
  ...props
}: React.ComponentProps<typeof RadixMenu.Root>) {
  const direction = useDirection();
  return <RadixMenu.Root dir={dir ?? direction} {...props} />;
}
export const DropdownMenuTrigger = RadixMenu.Trigger;
export const DropdownMenuGroup = RadixMenu.Group;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = "end",
  ...props
}: React.ComponentProps<typeof RadixMenu.Content>) {
  return (
    <RadixMenu.Portal>
      <RadixMenu.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={8}
        className={cn(OVERLAY_PANEL, "min-w-48 p-1", className)}
        {...props}
      />
    </RadixMenu.Portal>
  );
}

export function DropdownMenuItem({
  className,
  destructive = false,
  ...props
}: React.ComponentProps<typeof RadixMenu.Item> & { destructive?: boolean }) {
  return (
    <RadixMenu.Item
      className={cn(
        OVERLAY_ITEM,
        destructive && "text-danger data-[highlighted]:bg-danger-surface",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof RadixMenu.CheckboxItem>) {
  return (
    <RadixMenu.CheckboxItem className={cn(OVERLAY_ITEM, "ps-8", className)} {...props}>
      <span className="absolute start-2 grid place-items-center">
        <RadixMenu.ItemIndicator>
          <Check className="size-3.5" aria-hidden />
        </RadixMenu.ItemIndicator>
      </span>
      {children}
    </RadixMenu.CheckboxItem>
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof RadixMenu.Label>) {
  return <RadixMenu.Label className={cn(OVERLAY_LABEL, className)} {...props} />;
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof RadixMenu.Separator>) {
  return (
    <RadixMenu.Separator
      className={cn("-mx-1 my-1 h-px bg-line-subtle", className)}
      {...props}
    />
  );
}
