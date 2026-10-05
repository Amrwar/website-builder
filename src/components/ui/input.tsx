"use client";

import type { InputHTMLAttributes, Ref, TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/cn";
import { useFieldControl } from "./field";

/**
 * Text inputs.
 *
 * Both controls share one set of surface styles so a text field and a textarea
 * are visibly the same control at different heights. Field wiring (id, aria,
 * disabled) comes from the surrounding `<Field>` and is overridable by an
 * explicit prop.
 */

const CONTROL_BASE = [
  "w-full rounded-md border bg-canvas px-3 text-body-sm text-primary",
  "border-line placeholder:text-tertiary",
  "transition-[border-color,background-color] duration-fast ease-out-quint",
  "hover:border-line-strong",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
  "disabled:cursor-not-allowed disabled:bg-disabled disabled:text-fg-disabled",
  // The error state is driven by the field, not by a separate prop, so the
  // visual and the announced state can never disagree.
  "aria-[invalid=true]:border-danger aria-[invalid=true]:outline-danger",
];

export interface InputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "className"
> {
  className?: string;
  ref?: Ref<HTMLInputElement>;
}

export function Input({ className, type = "text", ...props }: InputProps) {
  const field = useFieldControl();
  return (
    <input
      type={type}
      className={cn(CONTROL_BASE, "h-10", className)}
      {...field}
      {...props}
    />
  );
}

export interface TextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "className"
> {
  className?: string;
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({ className, rows = 5, ...props }: TextareaProps) {
  const field = useFieldControl();
  return (
    <textarea
      rows={rows}
      className={cn(CONTROL_BASE, "resize-y py-2.5 leading-relaxed", className)}
      {...field}
      {...props}
    />
  );
}

export interface CharacterCountProps {
  value: string;
  max: number;
  /** Rendered as `${remaining}` is approaching zero. */
  label: (remaining: number) => string;
  className?: string;
}

/**
 * Remaining-characters hint.
 *
 * Silent until the user is close to the limit, then announced politely. A
 * counter that updates on every keystroke in a live region is unusable with a
 * screen reader, which is why the live region only engages near the boundary.
 */
export function CharacterCount({ value, max, label, className }: CharacterCountProps) {
  const remaining = max - value.length;
  const nearLimit = remaining <= Math.max(20, Math.floor(max * 0.1));

  return (
    <p
      className={cn(
        "text-caption tabular-nums",
        remaining < 0 ? "text-danger" : "text-tertiary",
        className,
      )}
      aria-live={nearLimit ? "polite" : "off"}
    >
      {label(remaining)}
    </p>
  );
}
