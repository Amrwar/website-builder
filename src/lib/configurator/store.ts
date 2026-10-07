"use client";

import {
  createEmptyDraft,
  draftSchema,
  firstUnsatisfiedStep,
  type ConfiguratorDraft,
  type StepId,
} from "./draft";
import { clearDraft, loadDraft, saveDraft, takeHandoff } from "./storage";
import type { Locale } from "@/config/locales";

/**
 * Configurator draft store.
 *
 * An external store read through `useSyncExternalStore` rather than React
 * state hydrated in an effect. Two reasons: the saved draft lives in
 * `localStorage`, which does not exist during server rendering, and loading it
 * in an effect means a setState during mount that cascades an extra render.
 * `useSyncExternalStore` is built for exactly this -- it serves the server
 * snapshot during hydration and swaps to the real one immediately after.
 *
 * Snapshots are immutable: every update replaces `current` so React can
 * compare references and re-render only when something actually changed.
 */

export type SaveState = "idle" | "saving" | "saved";

interface StoreState {
  draft: ConfiguratorDraft;
  /** When a draft was recovered from a previous visit, else null. */
  resumedFrom: Date | null;
  saveState: SaveState;
  /**
   * Where to open when another flow just handed this draft over, else null.
   * Fixed at the moment of arrival: derived from the live draft instead, the
   * screen would jump ahead the instant the customer answered the question
   * it opened on.
   */
  handoffStep: StepId | null;
}

let current: StoreState | null = null;
let serverSnapshot: StoreState | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
/** Ensures the saved draft is read at most once per page load. */
let restoreAttempted = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Prepares an empty store for a locale.
 *
 * Deliberately does NOT touch storage. Called during render, so it must
 * produce the same result on the server and on the client -- reading
 * `localStorage` here would make the first client snapshot differ from the
 * server's, which `useSyncExternalStore` resolves by keeping the server value
 * and leaving the restored draft invisible.
 */
export function ensureInitialised(locale: Locale): void {
  current ??= {
    draft: createEmptyDraft(locale),
    resumedFrom: null,
    saveState: "idle",
    handoffStep: null,
  };
}

/**
 * Loads a previously saved draft, if there is one.
 *
 * Called from a mount effect: storage is a browser-only external system, and
 * after hydration is the first moment it can be read safely. It publishes
 * through `emit`, so React picks the change up via its existing subscription
 * rather than through component state.
 */
export function restoreSaved(): void {
  // A handoff is read even after the once-per-load restore has happened:
  // client navigation keeps this module alive, so someone who opened the
  // configurator, went to Start my business and came back would otherwise
  // be shown the old in-memory draft instead of the one they just built.
  const handoff = takeHandoff();
  if (restoreAttempted && !handoff) return;
  restoreAttempted = true;

  // An autosave still pending from the old in-memory draft would land on
  // top of the one just handed over.
  if (handoff) clearTimeout(saveTimer);

  const restored = loadDraft();
  if (!restored || !current) return;

  current = {
    ...current,
    draft: restored.draft,
    // Not "we kept your progress": this is progress made a moment ago.
    resumedFrom: handoff ? null : restored.savedAt,
    handoffStep: handoff ? (firstUnsatisfiedStep(restored.draft) ?? "platform") : null,
  };
  emit();
}

export function getSnapshot(): StoreState {
  // `ensureInitialised` runs first in the hook, so this is always populated on
  // the client. The fallback keeps the function total rather than throwing.
  return current ?? getServerSnapshot("en");
}

export function getServerSnapshot(locale: Locale): StoreState {
  serverSnapshot ??= {
    draft: createEmptyDraft(locale),
    resumedFrom: null,
    saveState: "idle",
    handoffStep: null,
  };
  return serverSnapshot;
}

/** Debounce window for autosave: long enough to coalesce typing. */
const SAVE_DELAY_MS = 600;

export function updateDraft(
  recipe: (draft: ConfiguratorDraft) => ConfiguratorDraft,
): void {
  if (!current) return;

  const next = recipe(current.draft);
  if (next === current.draft) return;

  current = { ...current, draft: next, saveState: "saving" };
  emit();

  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    // Validate before persisting: writing a draft that would fail to load is
    // worse than not writing one, because it silently loses the customer's work.
    const parsed = draftSchema.safeParse(next);
    if (parsed.success) saveDraft(parsed.data);

    if (current) {
      current = { ...current, saveState: "saved" };
      emit();
    }
  }, SAVE_DELAY_MS);
}

/** Discards the saved draft and starts over. */
export function resetDraft(locale: Locale): void {
  clearTimeout(saveTimer);
  restoreAttempted = true;
  clearDraft();
  current = {
    draft: createEmptyDraft(locale),
    resumedFrom: null,
    saveState: "idle",
    handoffStep: null,
  };
  emit();
}

/** Clears the "resumed" banner without touching the draft itself. */
export function acknowledgeResume(): void {
  if (!current?.resumedFrom) return;
  current = { ...current, resumedFrom: null };
  emit();
}
