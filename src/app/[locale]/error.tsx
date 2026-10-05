"use client";

import { useEffect } from "react";

import { useTranslations } from "next-intl";

import { Container } from "@/components/layout/container";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/**
 * Page-level error boundary.
 *
 * Recoverable by design: `reset` re-renders the segment, which resolves the
 * common transient cases without a full reload. Layout-level failures fall
 * through to `global-error.tsx` instead, since the provider tree this relies
 * on would not exist.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors.unexpected");

  useEffect(() => {
    // Placeholder for the error reporter. Sentry is provisioned but not yet
    // wired; until then the digest is at least in the browser console so a
    // report can be correlated with the server log.
    console.error("[unhandled]", error.digest ?? error.message);
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
        <Link href="/" className={buttonVariants({ variant: "secondary" })}>
          {t("home")}
        </Link>
      </div>
    </Container>
  );
}
