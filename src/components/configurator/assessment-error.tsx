"use client";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

/**
 * What a customer sees when their scope could not be worked out.
 *
 * Shared by the three steps that depend on an assessment, because all three
 * previously handled its absence differently: the scope step showed one
 * generic message for every cause, and the review and start steps returned
 * `null` and rendered a heading above an empty page. A customer who has just
 * answered eight questions and is shown nothing has no idea whether the
 * platform broke or they did something wrong.
 *
 * The reason is named. "We could not work out your scope" is the truthful
 * message for an engine failure and the wrong one for a missing answer, and
 * the two need different actions from the person reading them.
 */
export type AssessmentFailure =
  "invalid_draft" | "invalid_platforms" | "failed" | "rate_limited";

export function AssessmentError({
  reason,
  onRetry,
  onEdit,
}: {
  reason: AssessmentFailure;
  onRetry: () => void;
  /** Sends them back to the step that can actually fix it, where one exists. */
  onEdit?: (step: "type" | "intake" | "platform") => void;
}) {
  const t = useTranslations("configurator.scope.error");

  // Only a genuine engine failure, or a busy window that has since passed, is
  // worth retrying: retrying an incomplete draft just fails again, which
  // teaches the customer the button is broken.
  const retryable = reason === "failed" || reason === "rate_limited";

  const target =
    reason === "invalid_platforms"
      ? "platform"
      : reason === "invalid_draft"
        ? "intake"
        : null;

  return (
    <ErrorState
      title={t(`${reason}.title`)}
      description={t(`${reason}.body`)}
      action={
        retryable ? (
          <Button
            variant="secondary"
            onClick={onRetry}
            startIcon={<RefreshCw className="size-4" />}
          >
            {t("retry")}
          </Button>
        ) : target && onEdit ? (
          <Button variant="secondary" onClick={() => onEdit(target)}>
            {t(`${reason}.action`)}
          </Button>
        ) : undefined
      }
    />
  );
}
