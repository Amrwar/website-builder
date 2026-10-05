import { ArrowUpRight, Check } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { Section, SectionHeading } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DELIVERY_DAYS } from "@/config/brand";
import { cn } from "@/lib/cn";

const INCLUDED = [
  "pages",
  "responsive",
  "forms",
  "singleRole",
  "hostedPayments",
  "seo",
] as const;

const LARGER = [
  "multiRole",
  "realtime",
  "marketplace",
  "native",
  "integrations",
  "logic",
] as const;

/**
 * Scope model.
 *
 * The section that keeps the fixed price honest: it states plainly what a
 * five-day build covers and what pushes a project into a larger one, then
 * works through a real example that does exceed it.
 *
 * The two columns are presented as equals -- the right-hand list is "becomes a
 * larger build", not "not included" -- because the commercial intent is to
 * route bigger work to a bigger build, not to refuse it.
 */
export async function Scope() {
  const t = await getTranslations("home.scope");
  const days = DELIVERY_DAYS.website;

  return (
    <Section
      id="whats-included"
      space="lg"
      surface="subtle"
      divided
      className="scroll-mt-20"
    >
      <Container width="wide" className="flex flex-col gap-10 sm:gap-14">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description", { days })}
        />

        <div className="grid gap-5 lg:grid-cols-2">
          <ScopeColumn
            title={t("includedTitle", { days })}
            tone="included"
            items={INCLUDED.map((key) => t(`includedItems.${key}`))}
          />
          <ScopeColumn
            title={t("largerTitle")}
            tone="larger"
            items={LARGER.map((key) => t(`largerItems.${key}`))}
          />
        </div>

        {/* Worked example: the restaurant brief, assessed out loud. */}
        <Card padding="lg" className="flex flex-col gap-6 lg:flex-row lg:gap-10">
          <div className="flex flex-col gap-3 lg:w-2/5">
            <p className="text-eyebrow uppercase text-tertiary">{t("example.title")}</p>
            <blockquote
              className={cn(
                "border-s-2 border-line-strong ps-4",
                "text-body-lg text-primary italic",
              )}
            >
              {t("example.quote")}
            </blockquote>
          </div>

          <div className="flex flex-1 flex-col gap-4 lg:border-s lg:border-line-subtle lg:ps-10">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-eyebrow uppercase text-tertiary">
                {t("example.verdictLabel")}
              </span>
              <Badge tone="warning">{t("example.verdict", { days })}</Badge>
            </div>
            <p className="text-body-sm text-secondary">{t("example.reason")}</p>
            <p className="text-caption text-tertiary">{t("example.note")}</p>
          </div>
        </Card>
      </Container>
    </Section>
  );
}

function ScopeColumn({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "included" | "larger";
}) {
  return (
    <Card padding="lg" surface="outlined" className="flex flex-col gap-5">
      <h3 className="text-display-sm text-primary">{title}</h3>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3 text-body-sm text-secondary">
            {tone === "included" ? (
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            ) : (
              <ArrowUpRight className="mt-0.5 size-4 shrink-0 rtl-flip text-warning" aria-hidden />
            )}
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}
