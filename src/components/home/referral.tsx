import { getLocale, getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { Section, SectionHeading } from "@/components/layout/section";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { getLocaleDefinition } from "@/config/locales";
import { REFERRAL } from "@/config/referral";
import { formatMoney } from "@/lib/pricing/money";

/**
 * Referral programme.
 *
 * Stated as a plain reciprocal amount rather than a percentage or a tiered
 * scheme, because the whole positioning of the product is a number you can
 * check. Both sides receive the same credit, which is also the simplest thing
 * to administer and the easiest to explain in one line.
 */
export async function Referral() {
  const t = await getTranslations("home.referral");
  const locale = await getLocale();
  const { intlTag } = getLocaleDefinition(locale);

  const amount = formatMoney(REFERRAL.creditPerSide, intlTag, {
    trimWholeDecimals: true,
  });

  const steps = ["share", "theyBuild", "bothCredited"] as const;

  return (
    <Section id="referral" space="lg" surface="subtle" divided className="scroll-mt-20">
      <Container width="wide" className="flex flex-col gap-10 sm:gap-12">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title", { amount })}
          description={t("description", { amount })}
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
                <h3 className="text-body font-semibold text-primary">
                  {t(`steps.${step}.title`, { amount })}
                </h3>
                <p className="text-body-sm text-secondary">
                  {t(`steps.${step}.body`, { amount })}
                </p>
              </Card>
            </li>
          ))}
        </ol>

        {/* The programme is described but not yet open. Saying so is the same
            rule the build wall, the portfolio and the reviews follow: a page
            whose whole argument is that the numbers are checkable cannot
            advertise a mechanism that does not exist. */}
        <Callout tone="info" title={t("notOpenYet")}>
          {t("notOpenYetBody")}
        </Callout>

        <p className="max-w-2xl text-body-sm text-secondary">{t("terms")}</p>
      </Container>
    </Section>
  );
}
