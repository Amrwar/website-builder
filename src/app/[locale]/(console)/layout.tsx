import type { ReactNode } from "react";

import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

import { CONSOLE_CLIENT_NAMESPACES, pickMessages } from "@/i18n/client-messages";

/**
 * Admin console route group.
 *
 * Deliberately outside `(app)`: the console has its own chrome -- a dense
 * sidebar grouped by what someone is doing -- and stacking it under the
 * customer-facing header would give staff two navigations competing for the
 * same screen.
 *
 * `AdminShell` is rendered per page, so each page declares which section it
 * is, and the guard that checks access reads the same declaration. The layout
 * only adds the console's copy for its client components, which nothing
 * outside the console should download.
 */
export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider
      messages={pickMessages(await getMessages(), CONSOLE_CLIENT_NAMESPACES)}
    >
      {children}
    </NextIntlClientProvider>
  );
}
