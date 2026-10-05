import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/**
 * Closing call to action.
 *
 * Rendered on the inverse surface -- the only full-bleed inversion on the
 * page, which is what gives it emphasis without resorting to a gradient.
 */
export async function ClosingCta() {
  const t = await getTranslations("home.cta");

  return (
    <Section id="start" space="lg" surface="inverse" className="scroll-mt-20">
      <Container width="content" className="flex flex-col items-center gap-6 text-center">
        <h2 className="max-w-2xl text-display-lg">{t("title")}</h2>
        <p className="max-w-xl text-body-lg opacity-70">{t("description")}</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/configure"
            className={cn(
              buttonVariants({ size: "lg" }),
              // On the inverted surface the ink button would disappear, so the
              // action inverts with it.
              "bg-canvas text-primary hover:bg-subtle",
            )}
          >
            {t("primary")}
            <ArrowRight className="rtl-flip size-4" aria-hidden />
          </Link>
          <Link
            href="#whats-included"
            className={cn(
              buttonVariants({ variant: "secondary", size: "lg" }),
              "border-line-inverse bg-transparent text-fg-inverse",
              "hover:border-line-inverse hover:bg-canvas/10 hover:text-fg-inverse",
            )}
          >
            {t("secondary")}
          </Link>
        </div>
      </Container>
    </Section>
  );
}
