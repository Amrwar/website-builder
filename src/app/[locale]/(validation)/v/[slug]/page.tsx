import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Callout } from "@/components/ui/callout";
import { LiveLanding } from "@/components/validation/landing-page";
import { BRAND } from "@/config/brand";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { landingContent } from "@/lib/validation/landing";
import { publicExperiment } from "@/server/validation/experiments";

/**
 * A published business-idea test.
 *
 * Rendered per request: whether it is live, paused or closed can change at
 * any moment, and a cached "live" page for a closed test would keep taking
 * details its owner no longer wants. Never indexed -- these are pages for
 * the people they are shared with, not search results.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/v/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const experiment = await publicExperiment(slug);
  return {
    title: experiment?.content.headline ?? "Not found",
    robots: { index: false, follow: false },
  };
}

export default async function ValidationPage({
  params,
}: PageProps<"/[locale]/v/[slug]">) {
  const { locale: rawLocale, slug } = await params;
  const experiment = await publicExperiment(slug);
  if (!experiment) notFound();

  const t = await getTranslations("validationPage");
  const content = experiment.content;
  const { intlTag } = getLocaleDefinition(resolveLocale(rawLocale));

  if (experiment.status !== "live") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-eyebrow text-tertiary uppercase" lang={content.locale}>
          {content.businessName}
        </p>
        <Callout tone="info" title={t(`status.${experiment.status}.title`)}>
          {t(`status.${experiment.status}.body`)}
        </Callout>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <LiveLanding
        slug={experiment.slug}
        lang={content.locale}
        content={landingContent(
          { ...content, captureMode: experiment.captureMode },
          {
            model: content.price.model,
            minorUnits: content.price.amountMinorUnits,
            currency: content.price.currency,
          },
          intlTag,
        )}
      />
      <p className="text-caption text-tertiary">
        <a
          className="underline hover:text-secondary"
          href={`mailto:${BRAND.supportEmail}?subject=${encodeURIComponent(`Report: ${experiment.slug}`)}`}
        >
          {t("report")}
        </a>
      </p>
    </div>
  );
}
