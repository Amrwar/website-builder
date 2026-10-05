import { getTranslations } from "next-intl/server";
import { locale as localeRootParam } from "next/root-params";

import { Container } from "@/components/layout/container";
import { SiteShell } from "@/components/site/site-shell";
import { resolveLocale } from "@/config/locales";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("errors.notFound");
  // Rendered outside the marketing group, so it brings its own chrome.
  const locale = resolveLocale(await localeRootParam());

  return (
    <SiteShell locale={locale}>
      <Container
        width="content"
        className="flex min-h-[60vh] flex-col items-center justify-center gap-5 py-20 text-center"
      >
        <p className="font-mono text-caption text-tertiary" data-numeric>
          404
        </p>
        <h1 className="text-display-lg text-primary">{t("title")}</h1>
        <p className="max-w-md text-body text-secondary">{t("body")}</p>
        <Link href="/" className={buttonVariants({ variant: "secondary" })}>
          {t("home")}
        </Link>
      </Container>
    </SiteShell>
  );
}
