import { getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("errors.notFound");

  return (
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
  );
}
