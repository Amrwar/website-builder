"use client";

import type { InputHTMLAttributes, ReactNode, Ref } from "react";

import { cn } from "@/lib/cn";

/**
 * Selectable card.
 *
 * A large, clickable option built on a native radio or checkbox. Used wherever
 * a choice deserves more room than a list row -- picking a build type, a design
 * approach, a plan.
 *
 * `type="radio"` members of the same `name` get arrow-key roving focus from
 * the browser, which is exactly the behaviour a hand-rolled card grid usually
 * loses.
 */
export interface ChoiceCardProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "className" | "children" | "title"
> {
  type?: "radio" | "checkbox";
  title: ReactNode;
  description?: ReactNode;
  /** Trailing detail, e.g. a price or a duration. */
  meta?: ReactNode;
  icon?: ReactNode;
  className?: string;
  ref?: Ref<HTMLInputElement>;
}

export function ChoiceCard({
  type = "radio",
  title,
  description,
  meta,
  icon,
  className,
  ...props
}: ChoiceCardProps) {
  return (
    <label
      className={cn(
        "group relative flex cursor-pointer gap-4 rounded-lg border p-5",
        "border-line bg-canvas",
        "duration-base transition-[border-color,background-color] ease-out-quint",
        "hover:border-line-strong hover:bg-hover",
        // Selection is shown by border and surface, not by colour alone.
        "has-[:checked]:border-action has-[:checked]:bg-selected",
        "has-[:focus-visible]:outline has-[:focus-visible]:outline-2",
        "has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
        props.disabled &&
          "cursor-not-allowed opacity-60 hover:border-line hover:bg-canvas",
        className,
      )}
    >
      <input type={type} className="sr-only" {...props} />

      {icon ? (
        <span aria-hidden className="mt-0.5 shrink-0 text-secondary">
          {icon}
        </span>
      ) : null}

      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-body font-semibold text-primary">{title}</span>
        {description ? (
          <span className="text-body-sm text-secondary">{description}</span>
        ) : null}
      </span>

      {meta ? <span className="shrink-0 text-body-sm text-secondary">{meta}</span> : null}
    </label>
  );
}
