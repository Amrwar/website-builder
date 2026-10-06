import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Numeric } from "@/components/ui/numeric";
import { BRAND } from "@/config/brand";
import { getLocaleDefinition, resolveLocale, type Locale } from "@/config/locales";
import { PLATFORM_TIME_ZONE } from "@/config/time";
import { lineLabel } from "@/lib/commerce/line-label";
import { createDateFormatters } from "@/lib/i18n/datetime";
import { formatMoney, money, type Currency } from "@/lib/pricing/money";
import type { InvoiceForCaller } from "@/server/commerce/invoices";

/**
 * An invoice, rendered in its own language.
 *
 * Three things here are deliberately *not* taken from the person reading the
 * page, because an invoice is a document of record and two people must not see
 * two different versions of it:
 *
 *  1. **Language.** `invoices.locale` is snapshotted at issue. A French
 *     customer's invoice stays French even when a staff member opens it with
 *     an English interface, and the page says so rather than leaving the
 *     reader to wonder why one panel is not in their language.
 *  2. **Currency.** The amount charged is in the order's currency. Re-rendering
 *     it in the viewer's display preference would show a figure nobody was
 *     ever charged, which is why `viewerPresentation` documents its currency
 *     as being for balances only.
 *  3. **Time zone.** The issue date is a property of the document, not of who
 *     is looking at it, so dates here are in the platform zone and the
 *     document states which. This is the one place that deliberately does not
 *     use `viewerDates`.
 *
 * The totals are read from their own columns rather than summed from the
 * lines. They were computed once, by the engine, and a document that
 * recalculates them can disagree with what the customer was charged.
 */
export async function InvoiceDocument({
  data,
  viewerLocale,
}: {
  data: InvoiceForCaller;
  /** The locale the surrounding page is in, only to decide whether to warn. */
  viewerLocale: Locale;
}) {
  const { invoice, lines, orderNumber } = data;

  const documentLocale = resolveLocale(invoice.locale);
  const definition = getLocaleDefinition(documentLocale);

  const t = await getTranslations({ locale: documentLocale, namespace: "invoice" });
  /**
   * The note explaining why this document is in another language is the one
   * thing on the page that must be in the *reader's* language. Rendered in the
   * document's, it was an Arabic sentence on a French page telling a French
   * reader why there was an Arabic sentence on their page.
   */
  const tViewer = await getTranslations({ locale: viewerLocale, namespace: "invoice" });
  const tViewerLanguages = await getTranslations({
    locale: viewerLocale,
    namespace: "languages",
  });
  const tLine = await getTranslations({
    locale: documentLocale,
    namespace: "orderLines",
  });
  const tCapability = await getTranslations({
    locale: documentLocale,
    namespace: "capabilities",
  });
  const tTotals = await getTranslations({
    locale: documentLocale,
    namespace: "checkout.totals",
  });

  const dates = createDateFormatters({
    intlTag: definition.intlTag,
    timeZone: PLATFORM_TIME_ZONE,
  });

  const currency = invoice.currency as Currency;
  /**
   * Negatives are passed through as negative amounts rather than prefixed with
   * a minus here, so `Intl` places the sign the way the locale does. A
   * hand-built "−CAD 50.00" is one string with a leading bidi-neutral,
   * which in Arabic the algorithm moves to the other end of the figure.
   */
  const amount = (minorUnits: number) =>
    formatMoney(money(minorUnits, currency), definition.intlTag, { display: "code" });

  const nameOf = (line: (typeof lines)[number]) => {
    const label = lineLabel({
      translationKey: line.translationKey,
      scopeTier: line.scopeTier,
    });
    if (!label) return line.productName;
    switch (label.kind) {
      case "build":
        // Two messages rather than one with an empty argument: a line whose
        // tier was never recorded was printing "Website build —" with a
        // dangling dash and nothing after it.
        return label.tier
          ? tLine(`buildWithTier.${label.buildType}`, {
              tier: tLine(`tier.${label.tier}`),
            })
          : tLine(`build.${label.buildType}`);
      case "design_service":
        return tLine("service.design");
      case "capability":
        return tCapability(`${label.capability}.name`);
    }
  };

  const outstanding = invoice.totalMinorUnits - invoice.refundedMinorUnits;

  return (
    /* The document carries its own direction. An Arabic invoice reads
       right-to-left inside an English page, and vice versa, because the
       document is the thing being read, not the chrome around it. */
    <div className="flex flex-col gap-6">
      {documentLocale !== viewerLocale ? (
        <Callout
          tone="info"
          title={tViewer("languageNote", {
            language: tViewerLanguages(documentLocale),
          })}
        />
      ) : null}

      <Card
        dir={definition.direction}
        lang={documentLocale}
        padding="lg"
        className="flex flex-col gap-8"
      >
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-eyebrow text-tertiary uppercase">{BRAND.name}</p>
            <h1 className="text-display-sm text-primary">{t("title")}</h1>
            <p className="text-caption text-tertiary">
              {t("number")} <Numeric>{invoice.number}</Numeric>
            </p>
          </div>
          <Badge tone={invoice.status === "paid" ? "success" : "info"}>
            {t(`status.${invoice.status}`)}
          </Badge>
        </header>

        <div className="grid gap-6 sm:grid-cols-2">
          <section className="flex flex-col gap-1">
            <p className="text-eyebrow text-tertiary uppercase">{t("billedTo")}</p>
            <p className="text-body font-medium text-primary">{invoice.billToName}</p>
            {invoice.billToOrganization ? (
              <p className="text-body-sm text-secondary">{invoice.billToOrganization}</p>
            ) : null}
            <p className="text-body-sm text-secondary">
              <Numeric>{invoice.billToEmail}</Numeric>
            </p>
            {invoice.billToTaxId ? (
              <p className="text-caption text-tertiary">
                <Numeric>{invoice.billToTaxId}</Numeric>
              </p>
            ) : null}
          </section>

          <dl className="flex flex-col gap-1">
            <Fact label={t("issuedOn")} value={dates.date(invoice.issuedAt)} />
            <Fact label={t("dueOn")} value={dates.date(invoice.dueAt)} />
            {invoice.paidAt ? (
              <Fact label={t("paidOn")} value={dates.date(invoice.paidAt)} />
            ) : null}
            {orderNumber ? <Fact label={t("order")} value={orderNumber} /> : null}
          </dl>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-line">
                <th className="py-2 text-start text-eyebrow text-tertiary uppercase">
                  {t("columns.item")}
                </th>
                <th className="py-2 text-end text-eyebrow text-tertiary uppercase">
                  {t("columns.quantity")}
                </th>
                <th className="py-2 text-end text-eyebrow text-tertiary uppercase">
                  {t("columns.unit")}
                </th>
                <th className="py-2 text-end text-eyebrow text-tertiary uppercase">
                  {t("columns.amount")}
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.productKey} className="border-b border-line-subtle">
                  <td className="py-3 text-body-sm text-primary">{nameOf(line)}</td>
                  <td className="py-3 text-end text-body-sm text-secondary">
                    <Numeric>{line.quantity}</Numeric>
                  </td>
                  <td className="py-3 text-end text-body-sm text-secondary">
                    <Numeric>{amount(line.unitAmountMinorUnits)}</Numeric>
                  </td>
                  <td className="py-3 text-end text-body-sm text-primary">
                    <Numeric>{amount(line.totalMinorUnits)}</Numeric>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="flex flex-col gap-2 border-t border-line pt-4">
          <Total label={t("subtotal")} value={amount(invoice.subtotalMinorUnits)} />
          {invoice.discountMinorUnits > 0 ? (
            <Total label={t("discount")} value={amount(-invoice.discountMinorUnits)} />
          ) : null}
          <Total
            label={
              invoice.taxRateBasisPoints > 0
                ? `${t("tax")} ${t("taxRate", {
                    rate: (invoice.taxRateBasisPoints / 100).toFixed(2),
                  })}`
                : t("tax")
            }
            value={amount(invoice.taxMinorUnits)}
          />
          <Total label={t("total")} value={amount(invoice.totalMinorUnits)} strong />
          {invoice.refundedMinorUnits > 0 ? (
            <>
              <Total label={t("refunded")} value={amount(-invoice.refundedMinorUnits)} />
              <Total label={t("balance")} value={amount(outstanding)} strong />
            </>
          ) : null}
        </dl>

        <footer className="flex flex-col gap-1 border-t border-line-subtle pt-4">
          {/* The tax note explains a zero tax line. Without it a zero reads as
              a mistake rather than as a business that is not yet registered. */}
          {isTaxNote(invoice.taxNote) ? (
            <p className="text-caption text-tertiary">
              {tTotals(`taxNote.${invoice.taxNote}`)}
            </p>
          ) : null}
          <p className="text-caption text-tertiary">
            {t("zoneNote", { zone: PLATFORM_TIME_ZONE })}
          </p>
        </footer>
      </Card>
    </div>
  );
}

/**
 * The stored note is a key, and the column is free text, so a value written by
 * an older release may no longer have a message. Checking rather than trusting
 * keeps a raw key off a financial document.
 */
function isTaxNote(value: string | null): value is "noRegistration" {
  return value === "noRegistration";
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-caption text-tertiary">{label}</dt>
      <dd className="text-body-sm text-primary">
        <Numeric>{value}</Numeric>
      </dd>
    </div>
  );
}

function Total({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  const emphasis = strong
    ? "text-body font-medium text-primary"
    : "text-body-sm text-secondary";
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={emphasis}>{label}</dt>
      <dd className={strong ? emphasis : "text-body-sm text-primary"}>
        <Numeric>{value}</Numeric>
      </dd>
    </div>
  );
}
