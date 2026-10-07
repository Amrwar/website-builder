/**
 * Which translation namespaces each part of the site sends to the browser.
 *
 * `<NextIntlClientProvider>` with no `messages` prop serialises the *entire*
 * catalogue into every page. Measured on the live home page: the full 86 KB
 * catalogue, staff console copy included, in a 303 KB HTML document for a
 * marketing page. Every visitor downloaded the production factory's button
 * labels and the refund screen's wording to read a hero section.
 *
 * Server components translate on the server and send only the resulting
 * strings, so they need none of this. Only *client* components read messages
 * in the browser, and they split cleanly by route group:
 *
 *   public   reachable signed out — marketing, configurator, auth
 *   app      the signed-in application — Build Room, account, billing
 *   console  the staff console
 *
 * A test scans every client component and fails if one uses a namespace its
 * route group does not send, because the symptom of getting this wrong is a
 * raw key such as `workspace.files.title` rendered to a customer, with no error.
 */

export const PUBLIC_CLIENT_NAMESPACES = [
  "nav",
  "theme",
  "localeSwitcher",
  "errors",
  "home",
  "configurator",
  "capabilities",
  "scopeReasons",
  "checkout",
  "growth",
  "startBusiness",
] as const;

export const APP_CLIENT_NAMESPACES = [
  ...PUBLIC_CLIENT_NAMESPACES,
  "workspace",
  "account",
  "maintenance",
  "notifications",
  "languages",
] as const;

/**
 * The console gets the application's set too. Staff pages render shared
 * project components, they are dynamic anyway, and a staff member seeing a raw
 * key is a worse outcome than a few kilobytes on a page nobody caches.
 */
export const CONSOLE_CLIENT_NAMESPACES = [
  ...APP_CLIENT_NAMESPACES,
  "adminConsole",
] as const;

type Messages = Record<string, unknown>;

/** The subset of a catalogue a route group's client components need. */
export function pickMessages(
  messages: Messages,
  namespaces: readonly string[],
): Messages {
  const picked: Messages = {};
  for (const namespace of namespaces) {
    if (namespace in messages) picked[namespace] = messages[namespace];
  }
  return picked;
}
