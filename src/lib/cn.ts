import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Custom font-size scale names from `theme.css`.
 *
 * tailwind-merge has to be told these explicitly. Without it the utility
 * cannot distinguish `text-body-sm` (a font size) from `text-secondary` (a
 * colour) and would wrongly treat them as conflicting, silently dropping one
 * when both are passed to `cn`.
 */
const FONT_SIZES = [
  "display-2xl",
  "display-xl",
  "display-lg",
  "display-md",
  "display-sm",
  "body-lg",
  "body",
  "body-sm",
  "caption",
  "eyebrow",
  "numeric",
] as const;

/** Semantic colour names from `theme.css`, usable as text/bg/border. */
const COLORS = [
  "canvas",
  "subtle",
  "sunken",
  "raised",
  "overlay",
  "inverse",
  "hover",
  "active",
  "selected",
  "disabled",
  "line",
  "line-subtle",
  "line-strong",
  "line-inverse",
  "focus",
  "primary",
  "secondary",
  "tertiary",
  "fg-disabled",
  "fg-inverse",
  "accent",
  "action",
  "action-hover",
  "action-active",
  "action-fg",
  "action-accent",
  "action-accent-hover",
  "action-accent-fg",
  "success",
  "success-surface",
  "success-line",
  "warning",
  "warning-surface",
  "warning-line",
  "danger",
  "danger-surface",
  "danger-line",
  "info",
  "info-surface",
  "info-line",
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...FONT_SIZES] }],
      "text-color": [{ text: [...COLORS] }],
      "bg-color": [{ bg: [...COLORS] }],
      "border-color": [{ border: [...COLORS] }],
    },
  },
});

/**
 * Merges class names, resolving Tailwind conflicts so the last value wins.
 * Use this anywhere a component accepts an overridable `className`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
