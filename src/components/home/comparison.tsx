import { Check, Minus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { Section, SectionHeading } from "@/components/layout/section";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowHeader,
} from "@/components/ui/table";
import { getLocaleDefinition } from "@/config/locales";
import { BUILD_PRODUCT_LIST } from "@/config/products";
import { formatMoney } from "@/lib/pricing/money";

/**
 * Website / system / app comparison.
 *
 * Answers the one question the three pricing cards cannot: which of these is
 * mine? Prices and guaranteed days are read from `BUILD_PRODUCTS`, so this
 * table cannot contradict the cards above it or the configurator.
 *
 * Availability is shown with a glyph and an accompanying screen-reader word,
 * never with a bare tick that reads as nothing.
 */

/** Rows whose value is per-build-type availability. */
const CAPABILITY_ROWS = [
  { key: "pages", available: { website: true, system: true, mobileApp: true } },
  { key: "cms", available: { website: true, system: true, mobileApp: false } },
  { key: "accounts", available: { website: false, system: true, mobileApp: true } },
  { key: "payments", available: { website: true, system: true, mobileApp: true } },
  { key: "dashboard", available: { website: false, system: true, mobileApp: false } },
  { key: "offline", available: { website: false, system: false, mobileApp: true } },
  {
    key: "storeSubmission",
    available: { website: false, system: false, mobileApp: true },
  },
] as const;

export async function Comparison() {
  const t = await getTranslations("home.comparison");
  const tProducts = await getTranslations("home.products");
  const locale = await getLocale();
  const { intlTag } = getLocaleDefinition(locale);

  return (
    <Section id="compare" space="lg" className="scroll-mt-20">
      <Container width="wide" className="flex flex-col gap-10 sm:gap-12">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        <Table label={t("tableLabel")}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.capability")}</TableHead>
              {BUILD_PRODUCT_LIST.map((product) => (
                <TableHead key={product.id}>{tProducts(`${product.id}.name`)}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableRowHeader>{t("rows.price")}</TableRowHeader>
              {BUILD_PRODUCT_LIST.map((product) => (
                <TableCell key={product.id}>
                  <span className="text-body-sm font-medium text-primary" data-numeric>
                    {product.priceModel === "from" ? `${tProducts("fromLabel")} ` : ""}
                    {formatMoney(product.basePrice, intlTag, { trimWholeDecimals: true })}
                  </span>
                </TableCell>
              ))}
            </TableRow>

            <TableRow>
              <TableRowHeader>{t("rows.delivery")}</TableRowHeader>
              {BUILD_PRODUCT_LIST.map((product) => (
                <TableCell key={product.id}>
                  {tProducts("deliveryLabel", { days: product.guaranteedDays })}
                </TableCell>
              ))}
            </TableRow>

            <TableRow>
              <TableRowHeader>{t("rows.review")}</TableRowHeader>
              {BUILD_PRODUCT_LIST.map((product) => (
                <TableCell key={product.id}>
                  {product.hasExternalReviewStep ? t("reviewOutside") : t("reviewNone")}
                </TableCell>
              ))}
            </TableRow>

            {CAPABILITY_ROWS.map((row) => (
              <TableRow key={row.key}>
                <TableRowHeader>{t(`rows.${row.key}`)}</TableRowHeader>
                {BUILD_PRODUCT_LIST.map((product) => {
                  const included = row.available[product.id];
                  return (
                    <TableCell key={product.id}>
                      {included ? (
                        <Check className="size-4 text-success" aria-hidden />
                      ) : (
                        <Minus className="size-4 text-tertiary" aria-hidden />
                      )}
                      {/* The glyph alone is silent to a screen reader. */}
                      <span className="sr-only">
                        {included ? t("included") : t("notIncluded")}
                      </span>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <p className="max-w-2xl text-body-sm text-secondary">{t("footnote")}</p>
      </Container>
    </Section>
  );
}
