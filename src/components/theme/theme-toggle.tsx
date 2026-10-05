"use client";

import { useCallback, useEffect, useId, useSyncExternalStore } from "react";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/cn";
import {
  DEFAULT_THEME_PREFERENCE,
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  THEME_PREFERENCES,
  resolveThemePreference,
  type ThemePreference,
} from "@/lib/theme";

const ICONS = {
  light: Sun,
  system: Monitor,
  dark: Moon,
} as const satisfies Record<ThemePreference, unknown>;

/* ---------------------------------------------------------------------------
 * The document element is the store.
 *
 * The pre-paint script writes `data-theme-preference` before React exists, so
 * the DOM -- not React state -- holds the truth. `useSyncExternalStore` is the
 * supported way to read that: it keeps the server snapshot and the first
 * client render consistent, so there is no hydration mismatch and no
 * setState-in-effect.
 * ------------------------------------------------------------------------ */

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot(): ThemePreference {
  return resolveThemePreference(document.documentElement.dataset.themePreference);
}

function getServerSnapshot(): ThemePreference {
  return DEFAULT_THEME_PREFERENCE;
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Writes the preference to the cookie and the document, then notifies readers. */
function setPreference(preference: ThemePreference) {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${THEME_COOKIE}=${preference}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax${secure}`;

  const root = document.documentElement;
  root.dataset.themePreference = preference;
  root.dataset.theme =
    preference === "system" ? (systemPrefersDark() ? "dark" : "light") : preference;

  for (const listener of listeners) listener();
}

export interface ThemeToggleProps {
  className?: string;
}

/**
 * Three-state theme control: light, follow-system, dark.
 *
 * Built on native radio inputs so group semantics and arrow-key navigation
 * come from the platform rather than from hand-wired ARIA and key handlers.
 * The visible control is the label; the input is visually hidden but remains
 * focusable, which is what drives the ring via `peer-focus-visible`.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const t = useTranslations("theme");
  const groupName = useId();
  const preference = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const select = useCallback((next: ThemePreference) => {
    setPreference(next);
  }, []);

  /** While following the system, track OS changes without a reload. */
  useEffect(() => {
    if (preference !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      document.documentElement.dataset.theme = query.matches ? "dark" : "light";
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [preference]);

  return (
    <fieldset
      className={cn(
        "flex items-center gap-0.5 rounded-md border border-line bg-subtle p-0.5",
        className,
      )}
    >
      <legend className="sr-only">{t("label")}</legend>
      {THEME_PREFERENCES.map((option) => {
        const Icon = ICONS[option];
        const checked = preference === option;
        return (
          <label key={option} className="relative cursor-pointer" title={t(option)}>
            <input
              type="radio"
              name={groupName}
              value={option}
              checked={checked}
              onChange={() => select(option)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "grid size-7 place-items-center rounded-sm",
                "transition-colors duration-fast ease-out-quint",
                "peer-focus-visible:outline peer-focus-visible:outline-2",
                "peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
                checked
                  ? "bg-canvas text-primary shadow-sm"
                  : "text-tertiary hover:text-primary",
              )}
            >
              <Icon className="size-3.5" aria-hidden strokeWidth={2} />
              <span className="sr-only">{t(option)}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
