import { getLocale, getTranslations } from "next-intl/server";

import { PricingCard } from "@/components/product/pricing-card";
import { Container } from "@/components/layout/container";
import { Section, SectionHeading } from "@/components/layout/section";
import { buttonVariants } from "@/components/ui/button";
import { getLocaleDefinition } from "@/config/locales";
import { MAINTENANCE_PLANS } from "@/config/maintenance";
import { Link } from "@/i18n/navigation";

/**
 * Maintenance plans.
 *
 * The honest framing of the fixed-price model: a build is bought once, and
 * keeping it running afterwards is a separate, cancellable decision. Bundling
 * hosting into the headline price would make the published figure untrue from
 * month two.
 *
 * Prices come from `MAINTENANCE_PLANS`, the same source the billing code will
 * read, so the page cannot drift from what is charged.
 */
export async function Maintenance() {
  const t = await getTranslations("home.maintenance");
  const locale = await getLocale();
  const { intlTag } = getLocaleDefinition(locale);

  return (
    <Section id="maintenance" space="lg" className="scroll-mt-20">
      <Container width="wide" className="flex flex-col gap-10 sm:gap-12">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        <ul className="grid gap-5 lg:grid-cols-3">
          {MAINTENANCE_PLANS.map((plan) => (
            <li key={plan.id} className="flex">
              <PricingCard
                name={t(`plans.${plan.id}.name`)}
                summary={t(`plans.${plan.id}.summary`)}
                price={plan.price}
                intlTag={intlTag}
                priceModel="fixed"
                fromLabel={t("fromLabel")}
                deliveryLabel={t("perMonth")}
                featured={plan.recommended}
                featuredLabel={t("recommended")}
                features={plan.featureKeys.map((key) => t(`features.${key}`))}
                action={
                  <Link
                    href="/configure"
                    className={buttonVariants({
                      variant: plan.recommended ? "primary" : "secondary",
                      fullWidth: true,
                    })}
                  >
                    {t("cta")}
                  </Link>
                }
              />
            </li>
          ))}
        </ul>

        <p className="max-w-2xl text-body-sm text-secondary">{t("footnote")}</p>
      </Container>
    </Section>
  );
}
