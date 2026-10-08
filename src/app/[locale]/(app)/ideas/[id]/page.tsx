import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  CopyLink,
  StatusControls,
  TurnIntoBusiness,
} from "@/components/account/idea-controls";
import { Container } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableMessageRow,
  TableRow,
} from "@/components/ui/table";
import { DEFAULT_LOCALE, getLocaleDefinition, resolveLocale } from "@/config/locales";
import { MIN_VISITORS_FOR_READING } from "@/config/validation";
import { Link } from "@/i18n/navigation";
import { siteOrigin } from "@/lib/site-origin";
import { prefillFromValidation } from "@/lib/validation/content";
import { getAuthContext } from "@/server/auth";
import { viewerDates } from "@/server/i18n";
import { experimentResults } from "@/server/validation/experiments";

export const metadata: Metadata = {
  title: "Idea results",
  robots: { index: false, follow: false },
};

const STATUS_TONE = { live: "success", paused: "warning", closed: "neutral" } as const;

/**
 * A test's results: early validation signals, and nothing more.
 *
 * Counts and ratios from recorded events, the sample size beside them, and a
 * plain statement of what they do not show. No benchmark is offered, because
 * there is no honest one: a "good" conversion rate depends on the offer, the
 * price and who the page was shared with.
 */
export default async function IdeaResultsPage({
  params,
}: PageProps<"/[locale]/ideas/[id]">) {
  const context = await getAuthContext();
  if (!context) redirect("/sign-in");

  const { locale, id } = await params;
  // Scoped to the session's user: a test belonging to anyone else is simply
  // not found, which is also what a guessed id gets.
  const results = await experimentResults(id, context);
  if (!results) notFound();

  const t = await getTranslations("ideas");
  const dates = await viewerDates(locale);
  const { intlTag } = getLocaleDefinition(resolveLocale(locale));
  const percent = new Intl.NumberFormat(intlTag, {
    style: "percent",
    maximumFractionDigits: 1,
  });
  const number = new Intl.NumberFormat(intlTag);
  // Days are UTC buckets, so they are labelled in UTC: shifting a bucket's
  // label into the viewer's zone would put Monday's views under Sunday.
  const dayFormat = new Intl.DateTimeFormat(intlTag, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  const prefix = results.locale === DEFAULT_LOCALE ? "" : `/${results.locale}`;
  const publicUrl = `${await siteOrigin()}${prefix}/v/${results.slug}`;
  const { signals } = results;

  const metrics: { key: string; value: string; note?: string }[] = [
    { key: "visitors", value: number.format(signals.visitors) },
    { key: "views", value: number.format(signals.views) },
    {
      key: "ctaClicks",
      value: number.format(signals.ctaClicks),
      note:
        signals.clickThroughRate === null
          ? undefined
          : t("metrics.ofVisitors", { rate: percent.format(signals.clickThroughRate) }),
    },
    { key: "inquiries", value: number.format(signals.inquiries) },
    { key: "signups", value: number.format(signals.signups) },
    {
      key: "conversion",
      value:
        signals.conversionRate === null ? "—" : percent.format(signals.conversionRate),
      note: t("metrics.conversionNote"),
    },
  ];

  const peak = Math.max(1, ...results.daily.map((point) => point.views));
  const leadColumns = results.captureMode === "inquiry" ? 4 : 3;

  return (
    <Container width="content" className="flex flex-col gap-10 py-12 sm:py-16">
      <Link href="/ideas" className="self-start text-body-sm text-accent hover:underline">
        {t("results.back")}
      </Link>

      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-display-lg text-primary" lang={results.locale}>
            {results.content.businessName}
          </h1>
          <Badge tone={STATUS_TONE[results.status]}>
            {t(`status.${results.status}`)}
          </Badge>
        </div>
        <p className="text-body-lg text-secondary" lang={results.locale}>
          {results.content.headline}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <code
            className="rounded-md bg-subtle px-2 py-1 text-caption break-all text-secondary"
            dir="ltr"
          >
            {publicUrl}
          </code>
          <CopyLink url={publicUrl} />
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-body-sm font-medium text-accent hover:underline"
          >
            {t("openPage")}
          </a>
        </div>
        <StatusControls id={results.id} status={results.status} />
      </header>

      <Callout tone="info" title={t("results.signalsTitle")}>
        {t("results.signalsBody")}
      </Callout>
      {signals.reading === "too_early" ? (
        <Callout tone="warning" title={t("results.tooEarlyTitle")}>
          {t("results.tooEarlyBody", {
            count: signals.visitors,
            min: MIN_VISITORS_FOR_READING,
          })}
        </Callout>
      ) : null}

      <section aria-labelledby="metrics-title" className="flex flex-col gap-4">
        <h2 id="metrics-title" className="text-display-sm text-primary">
          {t("results.metricsTitle")}
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map((metric) => (
            <Card key={metric.key} padding="md" className="flex flex-col gap-1">
              <dt className="text-caption text-tertiary">
                {t(`metrics.${metric.key as "visitors"}`)}
              </dt>
              <dd className="text-display-sm text-primary tabular-nums">
                {metric.value}
              </dd>
              {metric.note ? (
                <dd className="text-caption text-tertiary">{metric.note}</dd>
              ) : null}
            </Card>
          ))}
        </dl>
        {!results.distinctVisitors ? (
          <p className="text-caption text-tertiary">{t("results.viewsOnly")}</p>
        ) : null}
      </section>

      <section aria-labelledby="daily-title" className="flex flex-col gap-4">
        <h2 id="daily-title" className="text-display-sm text-primary">
          {t("results.dailyTitle")}
        </h2>
        <Table label={t("results.dailyTitle")}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("results.day")}</TableHead>
              <TableHead numeric>{t("metrics.views")}</TableHead>
              <TableHead numeric>{t("results.leads")}</TableHead>
              <TableHead>
                <span className="sr-only">{t("results.trend")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.daily.map((point) => (
              <TableRow key={point.day}>
                <TableCell>
                  {dayFormat.format(new Date(`${point.day}T00:00:00Z`))}
                </TableCell>
                <TableCell numeric>{number.format(point.views)}</TableCell>
                <TableCell numeric>{number.format(point.leads)}</TableCell>
                <TableCell className="w-1/3">
                  <div aria-hidden className="h-2 rounded-full bg-subtle">
                    <div
                      className="h-2 rounded-full bg-accent"
                      style={{ inlineSize: `${(point.views / peak) * 100}%` }}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section aria-labelledby="leads-title" className="flex flex-col gap-4">
        <h2 id="leads-title" className="text-display-sm text-primary">
          {t(`results.leadsTitle.${results.captureMode}`)}
        </h2>
        <p className="text-body-sm text-secondary">{t("results.leadsPrivacy")}</p>
        <Table label={t(`results.leadsTitle.${results.captureMode}`)}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("results.received")}</TableHead>
              <TableHead>{t("results.name")}</TableHead>
              <TableHead>{t("results.email")}</TableHead>
              {results.captureMode === "inquiry" ? (
                <TableHead>{t("results.message")}</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.leads.length === 0 ? (
              <TableMessageRow colSpan={leadColumns}>
                {t("results.noLeads")}
              </TableMessageRow>
            ) : (
              results.leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell>{dates.dateTime(lead.createdAt)}</TableCell>
                  <TableCell>{lead.name ?? "—"}</TableCell>
                  <TableCell>
                    <a
                      href={`mailto:${lead.email}`}
                      className="text-accent hover:underline"
                      dir="ltr"
                    >
                      {lead.email}
                    </a>
                  </TableCell>
                  {results.captureMode === "inquiry" ? (
                    <TableCell className="max-w-96 whitespace-pre-line">
                      {lead.message ?? "—"}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      <Card padding="lg" className="flex flex-col gap-4">
        <h2 className="text-display-sm text-primary">{t("next.title")}</h2>
        <p className="max-w-2xl text-body text-secondary">{t("next.body")}</p>
        <div>
          <TurnIntoBusiness prefill={prefillFromValidation(results.content)} />
        </div>
      </Card>
    </Container>
  );
}
