/**
 * Theme resolution.
 *
 * Three-state preference: an explicit `light`/`dark` choice, or `system` to
 * follow the OS. The choice is stored in a cookie rather than localStorage so
 * the server can render the correct theme on first paint -- localStorage is
 * not readable during SSR, which is what produces the familiar flash of the
 * wrong theme on load.
 */

export const THEME_COOKIE = "PLATFORM_THEME";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** The two themes that can actually be rendered. */
export type ResolvedTheme = "light" | "dark";

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === "string" && (THEME_PREFERENCES as readonly string[]).includes(value)
  );
}

/** Coerces untrusted cookie input to a valid preference. */
export function resolveThemePreference(value: unknown): ThemePreference {
  return isThemePreference(value) ? value : DEFAULT_THEME_PREFERENCE;
}

/**
 * Resolves a preference to a renderable theme.
 *
 * Returns `null` for `system` when the OS preference is unknown -- which is
 * always the case on the server. Callers render no `data-theme` attribute in
 * that case and let the pre-paint script settle it.
 */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark?: boolean,
): ResolvedTheme | null {
  if (preference !== "system") return preference;
  if (systemPrefersDark === undefined) return null;
  return systemPrefersDark ? "dark" : "light";
}

/**
 * Pre-paint script.
 *
 * Resolves the theme entirely on the client, reading the preference cookie
 * itself. Runs synchronously in `<head>`, so it completes before first paint
 * and there is no flash.
 *
 * Doing it here rather than server-side is a deliberate trade: reading
 * `cookies()` in the root layout would opt every page into dynamic rendering,
 * which costs the marketing pages their CDN caching. A few lines of inline
 * script buys back full static generation at no visual cost.
 *
 * It also publishes `data-theme-preference` so the theme control can show the
 * right one of the three states without the server needing to tell it.
 *
 * Wrapped in try/catch: `matchMedia` and `document.cookie` can both throw in
 * restricted embedding contexts, and a theme is never worth breaking a page.
 */
export const THEME_SCRIPT = `(function(){try{var e=document.documentElement,m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/),p=m?decodeURIComponent(m[1]):'system';if(p!=='light'&&p!=='dark')p='system';e.setAttribute('data-theme-preference',p);var r=p==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p;e.setAttribute('data-theme',r)}catch(_){}})();`;
