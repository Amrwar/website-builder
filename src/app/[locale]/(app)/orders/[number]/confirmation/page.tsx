import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Clock } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { Numeric } from "@/components/ui/numeric";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { db } from "@/db/client";
import { invoices, projects } from "@/db/schema";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { formatMoney, money, type Currency } from "@/lib/pricing/money";
import { logger } from "@/lib/logger";
import { fulfilCheckout } from "@/server/commerce/fulfilment";
import { getOrderForCaller } from "@/server/commerce/orders";
import { getAuthContext } from "@/server/auth";

export const metadata: Metadata = {
  title: "Order confirmed",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Post-payment landing page.
 *
 * Also fulfils, which is Stripe's recommended pattern: the webhook guarantees
 * fulfilment happens, this page makes it happen *immediately* for the customer
 * who is standing right there. Both paths call the same idempotent function,
 * so whichever arrives first does the work and the other reads the result.
 *
 * The page never trusts the URL. The session id is used only to ask the
 * provider what actually happened; a fabricated one resolves to nothing.
 */
export default async function ConfirmationPage({
  params,
  searchParams,
}: PageProps<"/[locale]/orders/[number]/confirmation">) {
  const context = await getAuthContext();
  if (!context) redirect("/sign-in");

  const { locale, number } = await params;
  const query = await searchParams;

  const sessionId = typeof query.session_id === "string" ? query.session_id : null;

  if (sessionId) {
    try {
      await fulfilCheckout(sessionId);
    } catch (error) {
      // A failure here is not fatal: the webhook is the guarantee. The page
      // falls through and shows whatever state the order is actually in.
      logger.warn("landing-page fulfilment attempt failed", { error });
    }
  }

  const order = await getOrderForCaller(number, context);
  const t = await getTranslations("checkout");
  const { intlTag } = getLocaleDefinition(resolveLocale(locale));

  const paid = order.status === "paid" || order.status === "completed";

  const project = order.projectId
    ? await db.query.projects.findFirst({ where: eq(projects.id, order.projectId) })
    : undefined;

  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.orderId, order.id),
  });

  // Money still settling: a delayed payment method completes the session
  // before the funds clear, and promising a project at that point would be
  // promising work nobody has paid for yet.
  if (!paid) {
    return (
      <Container width="content" className="py-12 sm:py-16">
        <h1 className="mb-4 text-display-lg text-primary">
          {t("confirmation.pendingTitle")}
        </h1>
        <p className="max-w-2xl text-body-lg text-secondary">
          {t("confirmation.pendingBody")}
        </p>
        <div className="mt-8">
          <Link
            href={`/orders/${order.number}`}
            className={buttonVariants({ variant: "secondary" })}
          >
            {t("confirmation.viewOrder")}
          </Link>
        </div>
      </Container>
    );
  }

  return (
    <Container width="content" className="py-12 sm:py-16">
      <header className="mb-10 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-eyebrow text-tertiary uppercase">
            {t("orderNumber", { number: order.number })}
          </p>
          <Badge tone="success">{t("status.paid")}</Badge>
        </div>
        <h1 className="text-display-lg text-primary">{t("confirmation.title")}</h1>
        <p className="max-w-2xl text-body-lg text-secondary">{t("confirmation.body")}</p>
      </header>

      <Card padding="lg" className="flex flex-col gap-6">
        <dl className="grid gap-5 sm:grid-cols-3">
          {project ? (
            <div className="flex flex-col gap-1">
              <dt className="text-eyebrow text-tertiary uppercase">
                {t("confirmation.labels.project")}
              </dt>
              <dd className="text-body font-medium text-primary" data-numeric>
                {project.reference}
              </dd>
            </div>
          ) : null}

          {invoice ? (
            <div className="flex flex-col gap-1">
              <dt className="text-eyebrow text-tertiary uppercase">
                {t("confirmation.labels.total")}
              </dt>
              <dd className="text-body font-medium text-primary" data-numeric>
                {formatMoney(
                  money(invoice.totalMinorUnits, invoice.currency as Currency),
                  intlTag,
                )}
              </dd>
            </div>
          ) : null}

          {invoice ? (
            <div className="flex flex-col gap-1">
              <dt className="text-eyebrow text-tertiary uppercase">
                {t("confirmation.labels.invoice")}
              </dt>
              <dd className="text-body font-medium text-primary">
                <Link
                  href={`/invoices/${invoice.number}`}
                  className="duration-fast underline decoration-line underline-offset-4 transition-colors ease-out-quint hover:decoration-current"
                >
                  <Numeric>{invoice.number}</Numeric>
                </Link>
              </dd>
            </div>
          ) : null}
        </dl>
      </Card>

      <section className="mt-10 flex flex-col gap-5">
        <h2 className="text-display-sm text-primary">{t("confirmation.nextTitle")}</h2>
        <ol className="flex flex-col gap-3">
          {(["assets", "build", "preview", "launch"] as const).map((step, index) => (
            <li key={step} className="flex items-start gap-3">
              <span
                aria-hidden
                className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-line text-caption text-tertiary tabular-nums"
              >
                {index + 1}
              </span>
              <span className="text-body-sm text-secondary">
                {t(`confirmation.next.${step}`)}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/*
       * Restated after payment as well as before it. This is the fact a
       * deadline dispute turns on, and the moment a customer is most likely to
       * assume the opposite.
       */}
      <div className="mt-8">
        <Callout tone="info" title={t("guarantee.clockTitle")}>
          <span className="flex items-start gap-2">
            <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("confirmation.clockNote")}
          </span>
        </Callout>
      </div>
    </Container>
  );
}
