import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { buttonVariants } from "@/components/ui/button";
import { Stepper } from "@/components/ui/stepper";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/**
 * Configurator entry.
 *
 * The conversion point of the page. It shows the four steps between here and a
 * price so the commitment is legible before anyone starts -- the most common
 * reason a configurator is abandoned is not knowing how long it will take.
 *
 * Rendered on the inverse surface so it reads as the page's one instruction,
 * without resorting to a gradient or an outsized button.
 */
export async function ConfiguratorEntry() {
  const t = await getTranslations("home.configuratorEntry");

  const steps = [
    {
      id: "describe",
      label: t("steps.describe.label"),
      description: t("steps.describe.detail"),
    },
    {
      id: "choose",
      label: t("steps.choose.label"),
      description: t("steps.choose.detail"),
    },
    {
      id: "assess",
      label: t("steps.assess.label"),
      description: t("steps.assess.detail"),
    },
    { id: "price", label: t("steps.price.label"), description: t("steps.price.detail") },
  ];

  return (
    <Section id="start-a-build" space="lg" surface="inverse" className="scroll-mt-20">
      <Container width="wide" className="flex flex-col gap-10">
        <div className="flex max-w-2xl flex-col gap-4">
          <p className="text-eyebrow uppercase opacity-60">{t("eyebrow")}</p>
          <h2 className="text-display-lg">{t("title")}</h2>
          <p className="text-body-lg opacity-70">{t("description")}</p>
        </div>

        {/*
         * `current={0}` is accurate: nobody has started. Showing a later step
         * as current would misrepresent progress the visitor has not made.
         */}
        <div className="rounded-lg border border-line-inverse/40 p-6 sm:p-8">
          <Stepper
            surface="inverse"
            steps={steps}
            current={0}
            label={t("stepsLabel")}
            statusLabel={(status) =>
              status === "complete"
                ? t("status.complete")
                : status === "current"
                  ? t("status.current")
                  : t("status.upcoming")
            }
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/configure"
            className={cn(
              buttonVariants({ size: "lg" }),
              // The ink button would vanish on this surface, so it inverts.
              "bg-canvas text-primary hover:bg-subtle",
            )}
          >
            {t("primaryCta")}
            <ArrowRight className="rtl-flip size-4" aria-hidden />
          </Link>
          <p className="text-body-sm opacity-60">{t("reassurance")}</p>
        </div>
      </Container>
    </Section>
  );
}
