import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AccountForms } from "@/components/account/account-forms";
import { Container } from "@/components/layout/container";
import { getAuthContext } from "@/server/auth";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

/**
 * Account settings.
 *
 * Reads the row server-side and hands the current values to the forms. The
 * proxy already redirects signed-out visitors, but this re-checks anyway: the
 * proxy is a coarse gate, and a page that assumes a session is one routing
 * change away from rendering someone else's data.
 */
export default async function AccountPage() {
  const context = await getAuthContext();
  if (!context) redirect("/sign-in");

  const t = await getTranslations("account");
  const { user } = context;

  return (
    <Container width="content" className="py-12 sm:py-16">
      <header className="mb-10 flex flex-col gap-3">
        <h1 className="text-display-lg text-primary">{t("title")}</h1>
        <p className="max-w-2xl text-body-lg text-secondary">{t("lede")}</p>
      </header>

      <AccountForms
        values={{
          email: user.email,
          displayName: user.displayName ?? "",
          businessName: user.businessName ?? "",
          businessWebsite: user.businessWebsite ?? "",
          billingCountry: user.billingCountry ?? "",
          taxId: user.taxId ?? "",
          preferredLocale: user.preferredLocale,
          preferredCurrency: user.preferredCurrency,
          timezone: user.timezone,
          notifyBuildUpdates: user.notifyBuildUpdates,
          notifyMessages: user.notifyMessages,
          notifyDeadlineAlerts: user.notifyDeadlineAlerts,
          notifyProductNews: user.notifyProductNews,
        }}
      />
    </Container>
  );
}
