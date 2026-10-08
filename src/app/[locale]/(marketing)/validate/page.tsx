import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { ValidateWizard } from "@/components/validation/validate-wizard";
import { resolveLocale } from "@/config/locales";
import { startCatalog } from "@/server/business/public";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/validate">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: resolveLocale(locale),
    namespace: "validate.meta",
  });
  return { title: t("title"), description: t("description") };
}

/** Prerendered like Start my business: it reads only the blueprint names. */
export const revalidate = 300;

export default async function ValidatePage({ params }: PageProps<"/[locale]/validate">) {
  const { locale } = await params;
  const catalog = await startCatalog(resolveLocale(locale));
  return (
    <Container width="content" className="py-12 sm:py-16">
      <ValidateWizard
        blueprints={catalog.blueprints.map((blueprint) => ({
          key: blueprint.key,
          name: blueprint.name,
        }))}
      />
    </Container>
  );
}
