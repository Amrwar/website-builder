import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { CheckoutSummary } from "@/components/commerce/checkout-summary";
import { PayButton } from "@/components/commerce/pay-button";
import { Container } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { resolveLocale } from "@/config/locales";
import { getOrderForCaller } from "@/server/commerce/orders";
import { getAuthContext } from "@/server/auth";

export const metadata: Metadata = {
  title: "Order",
  robots: { index: false, follow: false },
};

/**
 * Checkout review.
 *
 * Server-rendered from the order row, so the figures on screen are the figures
 * the server will charge -- there is no client-side price to drift or be
 * edited. `getOrderForCaller` scopes the lookup to the signed-in user inside
 * the query, and answers `not_found` for someone else's order rather than
 * `forbidden`, which would confirm the number exists.
 */
export default async function OrderPage({
  params,
  searchParams,
}: PageProps<"/[locale]/orders/[number]">) {
  const context = await getAuthContext();
  if (!context) redirect("/sign-in");

  const { locale, number } = await params;
  const query = await searchParams;

  const order = await getOrderForCaller(number, context);
  const t = await getTranslations("checkout");

  // Paid orders belong on the receipt, not on a page with a pay button.
  if (order.status === "paid" || order.status === "completed") {
    redirect(`/orders/${order.number}/confirmation`);
  }

  const payable = ["draft", "pending_payment", "failed"].includes(order.status);

  return (
    <Container width="content" className="py-12 sm:py-16">
      <header className="mb-10 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-eyebrow text-tertiary uppercase">
            {t("orderNumber", { number: order.number })}
          </p>
          <Badge tone={payable ? "neutral" : "warning"}>
            {t(`status.${order.status}`)}
          </Badge>
        </div>
        <h1 className="text-display-lg text-primary">{t("title")}</h1>
        <p className="max-w-2xl text-body-lg text-secondary">{t("subtitle")}</p>
      </header>

      {query.cancelled ? (
        <div className="mb-8">
          <Callout tone="info" title={t("cancelledNotice")} />
        </div>
      ) : null}

      <CheckoutSummary order={order} locale={resolveLocale(locale)} />

      {payable ? (
        <div className="mt-10">
          <PayButton orderNumber={order.number} />
        </div>
      ) : (
        <div className="mt-10">
          <Callout tone="warning" title={t(`status.${order.status}`)} />
        </div>
      )}
    </Container>
  );
}
