"use client";

import { useEffect } from "react";

import "@/styles/globals.css";

/**
 * Last-resort error boundary, for failures in the locale layout itself.
 *
 * It replaces the entire document, so it renders its own `<html>`/`<body>` and
 * imports the stylesheet directly -- no layout applies at this point.
 *
 * The copy is intentionally untranslated: reaching here means the i18n
 * provider failed to initialise, so calling into it again is exactly what
 * would fail a second time. English is a deliberate floor, not an oversight,
 * and the theme falls back to light for the same reason.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[fatal]", error.digest ?? error.message);
  }, [error]);

  return (
    <html lang="en" dir="ltr" data-theme="light">
      <body className="flex min-h-dvh items-center justify-center bg-canvas p-6 antialiased">
        <div className="flex max-w-md flex-col items-center gap-5 text-center">
          <h1 className="text-display-md text-primary">Something went wrong</h1>
          <p className="text-body text-secondary">
            The application failed to load. This has been logged. Reloading usually
            resolves it.
          </p>
          {error.digest ? (
            <p className="font-mono text-caption text-tertiary">{error.digest}</p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            className="duration-fast h-10 rounded-md bg-action px-4 text-body-sm font-medium text-action-fg transition-colors hover:bg-action-hover"
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
