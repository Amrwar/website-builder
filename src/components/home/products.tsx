import { ArrowRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { PricingCard } from "@/components/product/pricing-card";
import { Container } from "@/components/layout/container";
import { Section, SectionHeading } from "@/components/layout/section";
import { buttonVariants } from "@/components/ui/button";
import { getLocaleDefinition } from "@/config/locales";
import { BUILD_PRODUCT_LIST } from "@/config/products";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/**
 * The orderable products, presented as a published price list.
 *
 * Reads prices and guaranteed durations from `BUILD_PRODUCTS` rather than from
 * copy, so the marketing page can never disagree with what the configurator
 * actually charges.
 */
export async function Products() {
  const t = await getTranslations("home.products");
  const locale = await getLocale();
  const { intlTag } = getLocaleDefinition(locale);

  return (
    <Section id="pricing" space="lg" className="scroll-mt-20">
      <Container width="wide" className="flex flex-col gap-10 sm:gap-14">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        <ul className="grid gap-5 lg:grid-cols-3">
          {BUILD_PRODUCT_LIST.map((product) => (
            <li key={product.id} className="flex">
              <PricingCard
                name={t(`${product.id}.name`)}
                summary={t(`${product.id}.summary`)}
                price={product.basePrice}
                intlTag={intlTag}
                priceModel={product.priceModel}
                fromLabel={t("fromLabel")}
                deliveryLabel={t("deliveryLabel", { days: product.guaranteedDays })}
                deliveryWarning={product.hasExternalReviewStep}
                action={
                  <Link
                    href="/configure"
                    className={cn(
                      buttonVariants({ variant: "secondary", fullWidth: true }),
                      "justify-between",
                    )}
                  >
                    {t(`${product.id}.cta`)}
                    <ArrowRight className="rtl-flip size-4" aria-hidden />
                  </Link>
                }
              />
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
