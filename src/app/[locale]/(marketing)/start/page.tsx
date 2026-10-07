import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { StartBusiness } from "@/components/business/start-business";
import { Container } from "@/components/layout/container";
import { resolveLocale } from "@/config/locales";
import { startCatalog } from "@/server/business/public";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/start">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: resolveLocale(locale),
    namespace: "startBusiness.meta",
  });
  return { title: t("title"), description: t("description") };
}

/**
 * Start my business.
 *
 * Prerendered and revalidated rather than rendered per request: blueprints
 * change when an administrator publishes one, which is rare, and publishing
 * revalidates this path at once. The interval is only the backstop.
 *
 * No `loading.tsx` here, deliberately -- see the configurator route for what
 * a suspense boundary in this group has done before.
 */
export const revalidate = 300;

export default async function StartPage({ params }: PageProps<"/[locale]/start">) {
  const { locale } = await params;
  const catalog = await startCatalog(resolveLocale(locale));

  return (
    <Container width="content" className="py-12 sm:py-16">
      <StartBusiness catalog={catalog} />
    </Container>
  );
}
