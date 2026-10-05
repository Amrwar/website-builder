"use client";

import type { InputHTMLAttributes, ReactNode, Ref } from "react";

import { Check } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * Checkbox.
 *
 * A real `<input type="checkbox">`, visually hidden but focusable, with the
 * painted box driven off `peer-checked` / `peer-focus-visible`. Keyboard
 * behaviour, form participation and assistive-technology semantics then come
 * from the platform instead of being re-implemented with ARIA.
 */
export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "className"
> {
  label: ReactNode;
  description?: ReactNode;
  className?: string;
  ref?: Ref<HTMLInputElement>;
}

export function Checkbox({ label, description, className, ...props }: CheckboxProps) {
  return (
    <label
      className={cn(
        "group flex cursor-pointer items-start gap-3",
        props.disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <input type="checkbox" className="peer sr-only" {...props} />

      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-sm border",
          "border-line-strong bg-canvas text-transparent",
          "duration-fast transition-colors ease-out-quint",
          "group-hover:border-line-inverse",
          "peer-checked:border-action peer-checked:bg-action peer-checked:text-action-fg",
          "peer-focus-visible:outline peer-focus-visible:outline-2",
          "peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
        )}
      >
        <Check className="size-3" strokeWidth={3} />
      </span>

      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body-sm text-primary">{label}</span>
        {description ? (
          <span className="text-caption text-secondary">{description}</span>
        ) : null}
      </span>
    </label>
  );
}
