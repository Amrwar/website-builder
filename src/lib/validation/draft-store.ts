"use client";

import type { Locale } from "@/config/locales";
import { emptyContent, validationContentSchema, type ValidationContent } from "./content";

/**
 * The idea-test wizard's draft, kept in this browser.
 *
 * Kept because publishing needs an account, and the round trip through
 * sign-up must not cost the customer everything they typed. Read through
 * `useSyncExternalStore` for the same reason as the configurator's store:
 * storage exists only after hydration, and loading it in an effect would
 * mean a setState on mount.
 *
 * Saved drafts are re-validated on read. A draft that fails the schema
 * (older shape, hand-edited) is dropped -- except that mid-wizard drafts are
 * incomplete by nature, so only the shape is checked, not the minimums.
 */

const KEY = "buildline.validation.draft.v1";

let current: ValidationContent | null = null;
let restored = false;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

const shapeSchema = validationContentSchema.partial().extend({
  version: validationContentSchema.shape.version,
});

function emit() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let serverSnapshot: ValidationContent | null = null;

export function getServerSnapshot(locale: Locale): ValidationContent {
  serverSnapshot ??= emptyContent(locale);
  return serverSnapshot;
}

export function getSnapshot(locale: Locale): ValidationContent {
  current ??= emptyContent(locale);
  return current;
}

/** Reads the saved draft once, after hydration. */
export function restoreDraft(locale: Locale): void {
  if (restored) return;
  restored = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = shapeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      window.localStorage.removeItem(KEY);
      return;
    }
    current = { ...emptyContent(locale), ...parsed.data, locale };
    emit();
  } catch {
    // Storage blocked or corrupt: start empty, which is always correct.
  }
}

export function updateDraft(
  recipe: (draft: ValidationContent) => ValidationContent,
  locale: Locale,
) {
  current = recipe(getSnapshot(locale));
  emit();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(current));
    } catch {
      // Losing autosave is not worth interrupting anyone over.
    }
  }, 400);
}

export function clearDraft(locale: Locale): void {
  clearTimeout(saveTimer);
  current = emptyContent(locale);
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing useful to do.
  }
  emit();
}
