"use client";

import * as RadixSelect from "@radix-ui/react-select";

import { useDirection } from "@/components/ui/use-direction";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/cn";
import { useFieldControl } from "./field";
import { OVERLAY_ITEM, OVERLAY_LABEL, OVERLAY_PANEL } from "./overlay-styles";

/**
 * Select.
 *
 * A styled listbox rather than a native `<select>`, because the native control
 * cannot be styled consistently across platforms and cannot hold rich option
 * content. Radix restores what that costs: type-ahead, arrow keys, Home/End,
 * Escape, and correct `combobox`/`listbox` semantics.
 *
 * Where a plain list of short strings is all that is needed -- the locale
 * switcher, for instance -- the native element is still the better choice,
 * since it opens the platform picker on mobile.
 */

/**
 * Wrapped rather than re-exported so the page's direction reaches Radix. See
 * `useDirection` for why Radix does not pick it up on its own. An explicit
 * `dir` still wins, for the rare component that must not mirror.
 */
export function Select({ dir, ...props }: React.ComponentProps<typeof RadixSelect.Root>) {
  const direction = useDirection();
  return <RadixSelect.Root dir={dir ?? direction} {...props} />;
}
export const SelectGroup = RadixSelect.Group;
export const SelectValue = RadixSelect.Value;

export function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof RadixSelect.Trigger>) {
  // Picks up id / aria-describedby / aria-invalid from a surrounding <Field>.
  const field = useFieldControl();

  return (
    <RadixSelect.Trigger
      className={cn(
        "flex h-10 w-full items-center justify-between gap-2 rounded-md border px-3",
        "border-line bg-canvas text-body-sm text-primary",
        "duration-fast transition-colors ease-out-quint hover:border-line-strong",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        "disabled:cursor-not-allowed disabled:bg-disabled disabled:text-fg-disabled",
        "aria-[invalid=true]:border-danger",
        "data-[placeholder]:text-tertiary",
        className,
      )}
      {...field}
      {...props}
    >
      {children}
      <RadixSelect.Icon asChild>
        <ChevronDown className="size-4 shrink-0 text-tertiary" aria-hidden />
      </RadixSelect.Icon>
    </RadixSelect.Trigger>
  );
}

export function SelectContent({
  className,
  children,
  position = "popper",
  ...props
}: React.ComponentProps<typeof RadixSelect.Content>) {
  return (
    <RadixSelect.Portal>
      <RadixSelect.Content
        position={position}
        sideOffset={6}
        className={cn(
          OVERLAY_PANEL,
          // Match the trigger's width so the list does not jump narrower.
          "max-h-72 min-w-[var(--radix-select-trigger-width)]",
          className,
        )}
        {...props}
      >
        <RadixSelect.ScrollUpButton className="flex justify-center py-1 text-tertiary">
          <ChevronUp className="size-4" aria-hidden />
        </RadixSelect.ScrollUpButton>
        <RadixSelect.Viewport className="p-1">{children}</RadixSelect.Viewport>
        <RadixSelect.ScrollDownButton className="flex justify-center py-1 text-tertiary">
          <ChevronDown className="size-4" aria-hidden />
        </RadixSelect.ScrollDownButton>
      </RadixSelect.Content>
    </RadixSelect.Portal>
  );
}

export function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof RadixSelect.Item>) {
  return (
    <RadixSelect.Item className={cn(OVERLAY_ITEM, "ps-8", className)} {...props}>
      <span className="absolute start-2 grid place-items-center">
        <RadixSelect.ItemIndicator>
          <Check className="size-3.5" aria-hidden />
        </RadixSelect.ItemIndicator>
      </span>
      <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
    </RadixSelect.Item>
  );
}

export function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof RadixSelect.Label>) {
  return <RadixSelect.Label className={cn(OVERLAY_LABEL, className)} {...props} />;
}

export function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof RadixSelect.Separator>) {
  return (
    <RadixSelect.Separator
      className={cn("-mx-1 my-1 h-px bg-line-subtle", className)}
      {...props}
    />
  );
}
