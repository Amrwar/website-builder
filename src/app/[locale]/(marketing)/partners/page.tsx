import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PartnerApplicationForm } from "@/components/growth/partner-form";
import { Container } from "@/components/layout/container";
import { Section, SectionHeading } from "@/components/layout/section";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";

export async function generateMetadata(): Promise<Metadata> {
  // The locale comes from the request context that `next-intl` already has,
  // the way every other page here reads it.
  const t = await getTranslations("growth.partners");

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

/**
 * The partner programme.
 *
 * Public, and deliberately plain about what is on offer. The commission rate
 * is stated as a decision made per partner rather than as a headline number,
 * because it genuinely is: an agency that briefs the work and stands behind it
 * is not doing what an affiliate with an audience does, and publishing one
 * figure for both would make one of them a lie.
 */
export default async function PartnersPage() {
  const t = await getTranslations("growth.partners");

  const steps = ["apply", "refer", "earn"] as const;

  return (
    <>
      <Section space="lg">
        <Container width="wide" className="flex flex-col gap-10">
          <SectionHeading
            eyebrow={t("eyebrow")}
            title={t("title")}
            description={t("lede")}
          />

          <ol className="grid gap-5 lg:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step} className="flex">
                <Card padding="lg" className="flex flex-1 flex-col gap-3">
                  <span
                    className="font-mono text-caption text-tertiary"
                    data-numeric
                    aria-hidden
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h2 className="text-body font-semibold text-primary">
                    {t(`how.${step}.title`)}
                  </h2>
                  <p className="text-body-sm text-secondary">{t(`how.${step}.body`)}</p>
                </Card>
              </li>
            ))}
          </ol>

          <Callout tone="info" title={t("honest")} />
        </Container>
      </Section>

      <Section space="lg" surface="subtle" divided>
        <Container width="content" className="flex flex-col gap-8">
          <PartnerApplicationForm />

          <Card padding="lg" className="flex flex-col gap-2">
            <h2 className="text-body font-semibold text-primary">
              {t("affiliate.title")}
            </h2>
            <p className="text-body-sm text-secondary">{t("affiliate.body")}</p>
          </Card>
        </Container>
      </Section>
    </>
  );
}
