import { ArrowRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { Section, SectionHeading } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getLocaleDefinition } from "@/config/locales";
import { BUILD_PRODUCT_LIST } from "@/config/products";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/pricing/money";
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
          {BUILD_PRODUCT_LIST.map((product) => {
            const price = formatMoney(product.basePrice, intlTag, {
              trimWholeDecimals: true,
            });

            return (
              <li key={product.id} className="flex">
                <Card
                  padding="lg"
                  className="flex flex-1 flex-col gap-6 hover:border-line-strong"
                >
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-display-sm text-primary">
                      {t(`${product.id}.name`)}
                    </h3>
                    <Badge tone={product.hasExternalReviewStep ? "warning" : "neutral"}>
                      {t("deliveryLabel", { days: product.guaranteedDays })}
                    </Badge>
                  </div>

                  <div className="flex flex-col gap-1">
                    {/* A floor price is labelled as one. The `priceModel` flag
                     * makes it impossible to show a "from" price as fixed. */}
                    {product.priceModel === "from" ? (
                      <span className="text-caption uppercase tracking-wide text-tertiary">
                        {t("fromLabel")}
                      </span>
                    ) : null}
                    <p className="flex items-baseline gap-2">
                      <span className="text-display-lg text-primary" data-numeric>
                        {price}
                      </span>
                      <span className="text-body-sm text-tertiary">
                        {product.basePrice.currency}
                      </span>
                    </p>
                  </div>

                  <p className="flex-1 text-body-sm text-secondary">
                    {t(`${product.id}.summary`)}
                  </p>

                  <Link
                    href="/configure"
                    className={cn(
                      buttonVariants({ variant: "secondary", fullWidth: true }),
                      "justify-between",
                    )}
                  >
                    {t(`${product.id}.cta`)}
                    <ArrowRight className="size-4 rtl-flip" aria-hidden />
                  </Link>
                </Card>
              </li>
            );
          })}
        </ul>
      </Container>
    </Section>
  );
}
