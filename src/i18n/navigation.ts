import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/**
 * Locale-aware navigation primitives.
 *
 * Always import `Link`, `redirect` and `useRouter` from here rather than from
 * `next/link` or `next/navigation` -- these variants carry the active locale
 * prefix automatically, so no caller has to remember to build it.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
