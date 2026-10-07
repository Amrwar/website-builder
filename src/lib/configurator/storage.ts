"use client";

import { draftSchema, type ConfiguratorDraft } from "./draft";

/**
 * Draft persistence.
 *
 * Saved to `localStorage` so a half-finished configuration survives a reload,
 * a closed tab or a phone locking itself. Nothing here is sent anywhere: at
 * this point in the flow there is no account to attach a draft to, and
 * creating an anonymous server-side record for every visitor who opens the
 * configurator would be a far larger commitment than the problem warrants.
 *
 * The consequence, stated plainly in the UI rather than hidden: a draft is
 * tied to this browser. Once the customer has an account the draft moves to
 * their project record and follows them across devices.
 *
 * Every read is re-validated against the schema. A saved draft is untrusted
 * input -- it may have been written by an older version of this code, or
 * edited by hand -- and a malformed one must produce a clean empty state
 * rather than a crash on a page the customer is trying to buy from.
 */

const STORAGE_KEY = "buildline.configurator.draft.v1";

/** Age at which a saved draft is treated as abandoned rather than resumable. */
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

interface StoredEnvelope {
  savedAt: number;
  draft: unknown;
}

export interface LoadedDraft {
  draft: ConfiguratorDraft;
  savedAt: Date;
}

function storage(): Storage | null {
  // Private windows, blocked site data and embedded contexts all make this
  // throw rather than return null, so every access is guarded.
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveDraft(draft: ConfiguratorDraft): void {
  const store = storage();
  if (!store) return;
  try {
    const envelope: StoredEnvelope = { savedAt: Date.now(), draft };
    store.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Quota exceeded, or storage disabled mid-session. Losing autosave is not
    // worth interrupting the customer over; the in-memory draft still works.
  }
}

export function loadDraft(): LoadedDraft | null {
  const store = storage();
  if (!store) return null;

  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;

    const envelope = JSON.parse(raw) as StoredEnvelope;
    if (typeof envelope?.savedAt !== "number") return null;

    if (Date.now() - envelope.savedAt > MAX_AGE_MS) {
      clearDraft();
      return null;
    }

    const parsed = draftSchema.safeParse(envelope.draft);
    if (!parsed.success) {
      // Written by an older shape, or tampered with. Discard rather than try
      // to migrate a draft whose meaning we can no longer be sure of.
      clearDraft();
      return null;
    }

    return { draft: parsed.data, savedAt: new Date(envelope.savedAt) };
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // Nothing useful to do; the draft simply will not be cleared.
  }
}

/* -------------------------------------------------------------------------
 * Handoff
 * ---------------------------------------------------------------------- */

const HANDOFF_KEY = "buildline.configurator.handoff";

/**
 * Marks the saved draft as freshly handed over by another flow --
 * Business-in-a-Box -- rather than left behind by an earlier visit.
 *
 * The difference decides what the configurator says on arrival. A draft the
 * customer abandoned is offered back with "we kept your progress"; a draft
 * they built thirty seconds ago should simply open at the next question.
 * Session storage, so the mark cannot outlive the tab that set it.
 */
export function markHandoff(): void {
  try {
    window.sessionStorage.setItem(HANDOFF_KEY, "1");
  } catch {
    // Without the mark the configurator offers the draft as resumable, which
    // is still correct, only one click longer.
  }
}

/** Reads and clears the mark, so it applies to exactly one arrival. */
export function takeHandoff(): boolean {
  try {
    const marked = window.sessionStorage.getItem(HANDOFF_KEY) === "1";
    window.sessionStorage.removeItem(HANDOFF_KEY);
    return marked;
  } catch {
    return false;
  }
}
