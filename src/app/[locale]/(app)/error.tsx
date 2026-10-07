"use client";

import { useEffect } from "react";

import { useTranslations } from "next-intl";

import { Container } from "@/components/layout/container";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { logger } from "@/lib/logger";

/**
 * Error boundary for the signed-in application.
 *
 * It exists so a failure on one page does not take the whole document with it.
 * Without a boundary here, an error on billing or notifications fell through to
 * `global-error.tsx`, which replaces `<html>` -- so the customer lost the
 * navigation as well as the page, and the only way back was the browser's back
 * button. Rendering inside the app layout keeps the shell, so the rest of the
 * account is still one click away.
 *
 * Offers somewhere to go as well as a retry: if the segment fails again on
 * reset, a retry button on its own is a dead end.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors.unexpected");

  useEffect(() => {
    logger.error("app error boundary", {
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
      {/* The digest is what correlates this with the server-side log, so it is
          shown rather than hidden -- it is the only thing a customer can quote
          to support that identifies their failure. */}
      {error.digest ? (
        <p className="font-mono text-caption text-tertiary" data-numeric>
          {error.digest}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>{t("retry")}</Button>
        <Link href="/projects" className={buttonVariants({ variant: "secondary" })}>
          {t("backToBuilds")}
        </Link>
      </div>
    </Container>
  );
}
