"use client";

import { useEffect } from "react";

import { useTranslations } from "next-intl";

import { Container } from "@/components/layout/container";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { logger } from "@/lib/logger";

/**
 * Error boundary for the staff console.
 *
 * Same reason as the application's: without one, a failing admin page took the
 * entire document rather than the segment.
 *
 * Note that this renders *without* the console sidebar, unlike the
 * application's boundary, which keeps its navigation. `AdminShell` is rendered
 * per page and needs the viewer's role from the server, which a client error
 * boundary cannot fetch. Hence the explicit link back: it is the only way out
 * of this screen.
 *
 * Nothing about the error is described beyond the digest. A console surfaces
 * other people's data, and an error message is one of the easier places for it
 * to leak.
 */
export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors.unexpected");

  useEffect(() => {
    logger.error("console error boundary", {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <Container
      width="content"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-5 py-20 text-center"
    >
      <h1 className="text-display-lg text-primary">{t("title")}</h1>
      <p className="max-w-md text-body text-secondary">{t("body")}</p>
      {error.digest ? (
        <p className="font-mono text-caption text-tertiary" data-numeric>
          {error.digest}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>{t("retry")}</Button>
        <Link href="/admin" className={buttonVariants({ variant: "secondary" })}>
          {t("backToConsole")}
        </Link>
      </div>
    </Container>
  );
}
