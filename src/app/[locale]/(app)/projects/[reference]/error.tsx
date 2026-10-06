"use client";

import { useEffect } from "react";

import { useTranslations } from "next-intl";

import { Container } from "@/components/layout/container";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { logger } from "@/lib/logger";

/**
 * Build Room error boundary.
 *
 * Scoped to the room rather than to the whole application group, so a failure
 * loading one project leaves the rest of the signed-in area usable and offers
 * a way back to the list instead of a dead end.
 */
export default function BuildRoomError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("workspace");

  useEffect(() => {
    logger.error("build room error boundary", {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <Container
      width="content"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-5 py-16 text-center"
    >
      <h1 className="text-display-md text-primary">{t("errors.loadFailed")}</h1>
      {error.digest ? (
        <p className="font-mono text-caption text-tertiary" data-numeric>
          {error.digest}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>{t("errors.retry")}</Button>
        <Link href="/projects" className={buttonVariants({ variant: "secondary" })}>
          {t("back")}
        </Link>
      </div>
    </Container>
  );
}
