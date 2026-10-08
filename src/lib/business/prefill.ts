"use client";

import type { StartPrefill } from "@/lib/validation/content";

/**
 * Handing a tested idea to Start my business.
 *
 * Session storage, read once: the prefill is for the arrival that follows
 * the click, not for every later visit to the page. Read through
 * `useSyncExternalStore` by the caller -- the server snapshot is always
 * null, so the static page hydrates identically and then adopts the
 * prefill.
 */

const KEY = "buildline.start.prefill";

let cached: StartPrefill | null | undefined;

export function savePrefill(prefill: StartPrefill): void {
  cached = undefined;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(prefill));
  } catch {
    // Without it the customer starts with empty fields, which still works.
  }
}

function isPrefill(value: unknown): value is StartPrefill {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    (entry.blueprintKey === null || typeof entry.blueprintKey === "string") &&
    typeof entry.businessName === "string" &&
    typeof entry.targetCustomers === "string" &&
    typeof entry.offering === "string"
  );
}

export function readPrefill(): StartPrefill | null {
  if (cached !== undefined) return cached;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    cached = isPrefill(parsed) ? parsed : null;
  } catch {
    cached = null;
  }
  return cached;
}

export const subscribePrefill = () => () => {};
export const serverPrefill = () => null;
