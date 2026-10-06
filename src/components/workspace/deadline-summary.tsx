import { Clock } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import type { WorkspaceDeadline } from "@/server/workspace/queries";
import { cn } from "@/lib/cn";

/**
 * Where a project stands against its guarantee.
 *
 * Shows one of three honest states, and the first is the one that matters
 * most: a project that has been paid for but not started has **no** countdown,
 * and says so plainly rather than showing a number that implies one.
 */
export async function DeadlineSummary({
  deadline,
  guaranteedDays,
  intlTag,
  className,
}: {
  deadline: WorkspaceDeadline | null;
  guaranteedDays: number | null;
  intlTag: string;
  className?: string;
}) {
  const t = await getTranslations("workspace");

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat(intlTag, { dateStyle: "medium" }).format(date);

  if (!deadline) {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <p className="text-eyebrow text-tertiary uppercase">{t("deadline.title")}</p>
        <p className="text-body font-medium text-primary">{t("deadline.notStarted")}</p>
        <p className="text-caption text-secondary">
          {guaranteedDays ? t("deadline.notStartedHelp") : t("guarantee.none")}
        </p>
      </div>
    );
  }

  const { standing, deadlineAt } = deadline;

  const tone =
    standing.level === "missed"
      ? "danger"
      : standing.level === "critical"
        ? "warning"
        : standing.level === "tight"
          ? "warning"
          : "success";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2.5">
        <p className="text-eyebrow text-tertiary uppercase">{t("deadline.title")}</p>
        <Badge tone={tone}>{t(`deadline.level.${standing.level}`)}</Badge>
      </div>

      <p className="flex items-center gap-2 text-body font-medium text-primary">
        <Clock className="size-4 shrink-0 text-secondary" aria-hidden />
        {standing.missed
          ? t("deadline.missed")
          : standing.workingDaysRemaining <= 0
            ? t("deadline.lastDay")
            : t("deadline.remaining", { days: standing.workingDaysRemaining })}
      </p>

      <p className="text-caption text-secondary" data-numeric>
        {t("deadline.due", { date: formatDate(deadlineAt) })}
      </p>

      {standing.missed ? (
        /* The refund choice is stated the moment it becomes available, rather
           than waiting for the customer to ask what happens now. */
        <Callout tone="danger" title={t("deadline.missed")} className="mt-2">
          {t("deadline.missedHelp")}
        </Callout>
      ) : null}
    </div>
  );
}
