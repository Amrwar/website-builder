import { ArrowRight, Check } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { ProductionLine } from "@/components/home/production-line";
import { Container } from "@/components/layout/container";
import { buttonVariants } from "@/components/ui/button";
import { DELIVERY_DAYS } from "@/config/brand";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/**
 * Marketing hero.
 *
 * Leads with the promise and nothing else: no illustration, no gradient, no
 * mock browser frame. The hierarchy is headline, promise, proof, action.
 *
 * The production line sits below the fold-line content as a full-width band.
 * It is the thing that stops this reading as an agency page -- an agency sells
 * a relationship, and this sells a unit moving down a line.
 */
export async function Hero() {
  const t = await getTranslations("home.hero");

  // Ownership sits in the hero deliberately: "do I actually own this?" is a
  // question buyers carry into the page, and answering it late loses them.
  const trust = [
    t("trust.price"),
    t("trust.scope"),
    t("trust.deadline"),
    t("trust.ownership"),
  ];

  return (
    <section className="border-b border-line-subtle">
      <Container width="wide" className="pt-16 pb-14 sm:pt-24 sm:pb-20 lg:pt-32">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
          <div className="flex max-w-3xl flex-col gap-6">
            <p className="text-eyebrow text-tertiary uppercase">{t("eyebrow")}</p>

            <h1 className="text-display-2xl text-primary">{t("headline")}</h1>

            {/* The commercial promise, given its own weight below the headline */}
            <p className="max-w-2xl text-display-sm font-normal text-primary">
              {t("promise")}
            </p>

            <p className="max-w-xl text-body-lg text-secondary">{t("support")}</p>

            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/configure"
                className={buttonVariants({ variant: "primary", size: "lg" })}
              >
                {t("primaryCta")}
                <ArrowRight className="rtl-flip size-4" aria-hidden />
              </Link>
              <Link
                href="#how-it-works"
                className={buttonVariants({ variant: "secondary", size: "lg" })}
              >
                {t("secondaryCta")}
              </Link>
            </div>
          </div>

          {/*
           * Specification panel: the promise restated as measurements. Reads
           * as a production spec sheet rather than a decorative hero graphic,
           * and uses tabular figures so the numbers align on the baseline.
           */}
          <dl
            className={cn(
              "grid shrink-0 grid-cols-2 gap-px overflow-hidden rounded-lg",
              "border border-line bg-line lg:w-72 lg:grid-cols-1",
            )}
          >
            <SpecRow
              value={String(DELIVERY_DAYS.website)}
              unit={t("spec.daysUnit")}
              label={t("spec.websites")}
            />
            <SpecRow
              value={String(DELIVERY_DAYS.mobileApp)}
              unit={t("spec.daysUnit")}
              label={t("spec.apps")}
            />
          </dl>
        </div>

        <ul className="mt-12 grid gap-3 border-t border-line-subtle pt-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {trust.map((item) => (
            <li
              key={item}
              className="flex items-center gap-2 text-body-sm text-secondary"
            >
              <Check className="size-4 shrink-0 text-success" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </Container>

      <div className="border-t border-line-subtle bg-subtle">
        <Container width="wide" className="py-10 sm:py-12">
          <ProductionLine />
        </Container>
      </div>
    </section>
  );
}

function SpecRow({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <div className="flex flex-col gap-1 bg-canvas p-5">
      <dt className="text-eyebrow text-tertiary uppercase">{label}</dt>
      <dd className="flex items-baseline gap-1.5">
        <span className="text-display-md text-primary" data-numeric>
          {value}
        </span>
        <span className="text-body-sm text-secondary">{unit}</span>
      </dd>
    </div>
  );
}
