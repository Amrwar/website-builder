import { getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { Section, SectionHeading } from "@/components/layout/section";
import { GUARANTEE_START_STAGE, JOURNEY_STAGES, stageLabel } from "@/config/journey";
import { cn } from "@/lib/cn";

/**
 * The ten-stage production line.
 *
 * Presented as a numbered sequence on a grid -- the structural, spec-sheet
 * reading of a process, rather than an illustrated timeline. The stage where
 * the guaranteed countdown begins is marked, because that is the detail
 * customers most often misread.
 */
export async function Journey() {
  const t = await getTranslations("home.journey");

  return (
    <Section
      id="how-it-works"
      space="lg"
      surface="subtle"
      divided
      className="scroll-mt-20"
    >
      <Container width="wide" className="flex flex-col gap-10 sm:gap-14">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        <ol className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
          {JOURNEY_STAGES.map((stage) => {
            const isGuaranteeStart = stage === GUARANTEE_START_STAGE;

            return (
              <li
                key={stage}
                className={cn(
                  "flex flex-col gap-2 bg-canvas p-5",
                  "duration-base transition-colors ease-out-quint hover:bg-hover",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="font-mono text-caption text-tertiary"
                    data-numeric
                    aria-hidden
                  >
                    {stageLabel(stage)}
                  </span>
                  {isGuaranteeStart ? (
                    <span className="size-1.5 rounded-full bg-warning" aria-hidden />
                  ) : null}
                </div>
                <h3 className="text-body font-semibold text-primary">
                  {t(`stages.${stage}.name`)}
                </h3>
                <p className="text-body-sm text-secondary">
                  {t(`stages.${stage}.detail`)}
                </p>
              </li>
            );
          })}
        </ol>

        <p className="flex items-center gap-2.5 text-body-sm text-secondary">
          <span className="size-1.5 shrink-0 rounded-full bg-warning" aria-hidden />
          {t("clockNote")}
        </p>
      </Container>
    </Section>
  );
}
