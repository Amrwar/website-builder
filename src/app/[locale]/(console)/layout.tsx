import type { ReactNode } from "react";

/**
 * Admin console route group.
 *
 * Deliberately outside `(app)`: the console has its own chrome -- a dense
 * sidebar grouped by what someone is doing -- and stacking it under the
 * customer-facing header would give staff two navigations competing for the
 * same screen.
 *
 * The layout itself is a pass-through. `AdminShell` is rendered per page, so
 * each page declares which section it is, and the guard that checks access
 * reads the same declaration.
 */
export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
