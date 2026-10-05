import { Clock, RotateCcw, Store } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { Section, SectionHeading } from "@/components/layout/section";
import { Card } from "@/components/ui/card";
import { MISSED_DEADLINE_REFUND } from "@/config/brand";

/**
 * The delivery guarantee, stated in three parts: when the clock starts, what
 * happens if it is missed, and what the guarantee explicitly excludes.
 *
 * The exclusion is given equal visual weight rather than being buried in a
 * footnote -- a guarantee with a hidden carve-out is not a guarantee.
 */
export async function Guarantee() {
  const t = await getTranslations("home.guarantee");

  return (
    <Section space="lg">
      <Container width="wide" className="flex flex-col gap-10 sm:gap-14">
        <SectionHeading eyebrow={t("eyebrow")} title={t("title")} />

        <div className="grid gap-5 lg:grid-cols-3">
          <Card padding="lg" className="flex flex-col gap-4">
            <Clock className="size-5 text-tertiary" aria-hidden />
            <h3 className="text-display-sm text-primary">{t("clock.title")}</h3>
            <p className="text-body-sm text-secondary">{t("clock.body")}</p>
          </Card>

          <Card padding="lg" className="flex flex-col gap-4">
            <RotateCcw className="size-5 text-tertiary" aria-hidden />
            <h3 className="text-display-sm text-primary">{t("missed.title")}</h3>
            {/*
             * Two-column grid rather than a fixed-width figure: the column
             * sizes itself to the widest percentage, so "100%" cannot collide
             * with its label and both rows stay aligned in any locale.
             */}
            <ul className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2.5">
              <RefundOption
                percent={MISSED_DEADLINE_REFUND.cancelPercent}
                text={t("missed.cancel", {
                  percent: MISSED_DEADLINE_REFUND.cancelPercent,
                })}
              />
              <RefundOption
                percent={MISSED_DEADLINE_REFUND.continuePercent}
                text={t("missed.continue", {
                  percent: MISSED_DEADLINE_REFUND.continuePercent,
                })}
              />
            </ul>
            <p className="text-body-sm text-secondary">{t("missed.body")}</p>
          </Card>

          <Card padding="lg" surface="subtle" className="flex flex-col gap-4">
            <Store className="size-5 text-tertiary" aria-hidden />
            <h3 className="text-display-sm text-primary">{t("stores.title")}</h3>
            <p className="text-body-sm text-secondary">{t("stores.body")}</p>
          </Card>
        </div>
      </Container>
    </Section>
  );
}

function RefundOption({ percent, text }: { percent: number; text: string }) {
  return (
    // `contents` lifts the two spans into the parent grid so they participate
    // in its shared column sizing.
    <li className="contents">
      <span className="text-display-sm text-primary" data-numeric aria-hidden>
        {percent}%
      </span>
      <span className="text-body-sm text-secondary">{text}</span>
    </li>
  );
}
