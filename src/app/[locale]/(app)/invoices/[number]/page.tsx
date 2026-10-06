import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { InvoiceDocument } from "@/components/commerce/invoice-document";
import { Container } from "@/components/layout/container";
import { EmptyState } from "@/components/ui/empty-state";
import { resolveLocale } from "@/config/locales";
import { ApiError } from "@/lib/api/response";
import { getAuthContext } from "@/server/auth";
import { getInvoiceForCaller } from "@/server/commerce/invoices";

export const metadata: Metadata = {
  title: "Invoice",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * One invoice.
 *
 * Re-authenticates and re-scopes here rather than trusting the link: an
 * invoice number is sequential and guessable by design, so the only thing
 * standing between a customer and the next customer's invoice is the ownership
 * filter in `getInvoiceForCaller`.
 *
 * A number that does not exist and one that belongs to someone else give the
 * same answer, for the same reason staff routes answer `not_found`: a
 * different response for the second confirms the invoice exists.
 */
export default async function InvoicePage({
  params,
}: PageProps<"/[locale]/invoices/[number]">) {
  const context = await getAuthContext();
  if (!context) redirect("/sign-in");

  const { locale, number } = await params;
  const t = await getTranslations("invoice");

  let data;
  try {
    data = await getInvoiceForCaller(number, context);
  } catch (error) {
    if (error instanceof ApiError && error.code === "not_found") {
      return (
        <Container width="content" className="py-12 sm:py-16">
          <EmptyState title={t("notFound")} description={t("notFoundBody")} />
        </Container>
      );
    }
    throw error;
  }

  return (
    <Container width="content" className="py-12 sm:py-16">
      <InvoiceDocument data={data} viewerLocale={resolveLocale(locale)} />
    </Container>
  );
}
