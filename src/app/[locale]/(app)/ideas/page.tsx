import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Lightbulb } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { getAuthContext } from "@/server/auth";
import { viewerDates } from "@/server/i18n";
import { listExperiments } from "@/server/validation/experiments";

export const metadata: Metadata = {
  title: "Ideas",
  robots: { index: false, follow: false },
};

const STATUS_TONE = { live: "success", paused: "warning", closed: "neutral" } as const;

/** The customer's idea tests, with their headline numbers. */
export default async function IdeasPage({ params }: PageProps<"/[locale]/ideas">) {
  const context = await getAuthContext();
  if (!context) redirect("/sign-in");

  const { locale } = await params;
  const t = await getTranslations("ideas");
  const dates = await viewerDates(locale);
  const { intlTag } = getLocaleDefinition(resolveLocale(locale));
  const percent = new Intl.NumberFormat(intlTag, {
    style: "percent",
    maximumFractionDigits: 1,
  });

  const experiments = await listExperiments(context);

  return (
    <Container width="content" className="py-12 sm:py-16">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-3">
          <h1 className="text-display-lg text-primary">{t("list.title")}</h1>
          <p className="max-w-2xl text-body-lg text-secondary">{t("list.subtitle")}</p>
        </div>
        {experiments.length > 0 ? (
          <Link href="/validate" className={buttonVariants({ variant: "secondary" })}>
            {t("list.new")}
          </Link>
        ) : null}
      </header>

      {experiments.length === 0 ? (
        <EmptyState
          icon={<Lightbulb className="size-6" />}
          title={t("list.empty.title")}
          description={t("list.empty.body")}
          action={
            <Link href="/validate" className={buttonVariants({ variant: "primary" })}>
              {t("list.empty.cta")}
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {experiments.map((experiment) => (
            <li key={experiment.id}>
              <Link href={`/ideas/${experiment.id}`} className="block">
                <Card
                  padding="lg"
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-4",
                    "duration-fast transition-colors ease-out-quint hover:bg-hover",
                  )}
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <span
                      className="text-body font-medium text-primary"
                      lang={experiment.locale}
                    >
                      {experiment.content.businessName}
                    </span>
                    <span
                      className="truncate text-body-sm text-secondary"
                      lang={experiment.locale}
                    >
                      {experiment.content.headline}
                    </span>
                    <span className="text-caption text-tertiary" data-numeric>
                      {dates.date(experiment.createdAt)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-caption text-secondary">
                    <span data-numeric>
                      {t("list.visitors", { count: experiment.signals.visitors })}
                    </span>
                    <span data-numeric>
                      {t("list.leads", { count: experiment.signals.leads })}
                    </span>
                    <span data-numeric>
                      {experiment.signals.conversionRate === null
                        ? "—"
                        : percent.format(experiment.signals.conversionRate)}
                    </span>
                    <Badge tone={STATUS_TONE[experiment.status]}>
                      {t(`status.${experiment.status}`)}
                    </Badge>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
