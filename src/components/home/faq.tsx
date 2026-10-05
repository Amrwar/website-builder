import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { Section, SectionHeading } from "@/components/layout/section";
import { cn } from "@/lib/cn";

/**
 * Frequently asked questions.
 *
 * Built on native `<details>` / `<summary>`. The element is already a
 * disclosure widget: it is focusable, toggles on Enter and Space, exposes the
 * correct expanded state, and works before JavaScript loads. A hand-built
 * accordion has to re-implement all of that and usually gets the keyboard
 * contract subtly wrong.
 *
 * The questions are ordered by what actually blocks a purchase: what you get,
 * who owns it, and what happens when something goes wrong.
 */

const QUESTIONS = [
  "included",
  "ownership",
  "clockStart",
  "missedDeadline",
  "biggerIdea",
  "changes",
  "hosting",
  "appStores",
  "refund",
  "different",
] as const;

export async function Faq() {
  const t = await getTranslations("home.faq");

  return (
    <Section id="faq" space="lg" className="scroll-mt-20">
      <Container width="wide" className="flex flex-col gap-10 sm:gap-12">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        <div className="max-w-3xl divide-y divide-line-subtle border-y border-line-subtle">
          {QUESTIONS.map((key) => (
            <details key={key} className="group">
              <summary
                className={cn(
                  "flex cursor-pointer list-none items-start justify-between gap-6 py-5",
                  "text-body font-medium text-primary",
                  "duration-fast transition-colors ease-out-quint hover:text-accent",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                  // Chrome and Safari draw their own marker; remove both.
                  "[&::-webkit-details-marker]:hidden",
                )}
              >
                {t(`items.${key}.q`)}
                <Plus
                  aria-hidden
                  className={cn(
                    "mt-0.5 size-4 shrink-0 text-tertiary",
                    "duration-base transition-transform ease-out-quint",
                    "group-open:rotate-45",
                  )}
                />
              </summary>
              <p className="max-w-prose pb-5 text-body-sm text-secondary">
                {t(`items.${key}.a`)}
              </p>
            </details>
          ))}
        </div>
      </Container>
    </Section>
  );
}
