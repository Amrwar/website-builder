"use client";

import { useLocale } from "next-intl";

import { getDirection, resolveLocale, type TextDirection } from "@/config/locales";

/**
 * The direction the current page runs in, for the primitives that need telling.
 *
 * Radix does **not** read `dir` from the document. Every primitive that cares
 * about direction defaults to `"ltr"` and writes that onto its own wrapper
 * element, which then overrides the `dir="rtl"` on `<html>` for its entire
 * subtree. The symptom is easy to miss in review and obvious once seen: the
 * page chrome mirrors correctly, and then one tab panel lays itself out
 * left-to-right in the middle of an Arabic page. That is how this was found,
 * on the pricing console.
 *
 * It is not only layout. Roving focus is direction-aware, so without this the
 * right arrow key moves to the *previous* tab in Arabic.
 *
 * Radix ships a `DirectionProvider` that would do this once at the root, and
 * that was tried first. It does not work here: every Radix package nests its
 * own copy of `@radix-ui/react-direction`, so a provider imported at the top
 * level writes to a different React context from the one each primitive
 * reads. Passing `dir` per primitive has no such failure mode, and the design
 * system wraps each primitive exactly once, so there is still only one place
 * per component to get it right.
 */
export function useDirection(): TextDirection {
  return getDirection(resolveLocale(useLocale()));
}
