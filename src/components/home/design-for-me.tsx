import { PenTool, Sparkles, Upload } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { Section, SectionHeading } from "@/components/layout/section";
import { Card } from "@/components/ui/card";
import { Icon, type IconComponent } from "@/components/ui/icon";
import { DESIGN_APPROACHES } from "@/db/schema/enums";

/**
 * Design handling.
 *
 * Removes the objection that stops most non-designers ordering: "I don't have
 * a logo or any idea what it should look like." The three options map exactly
 * onto `DESIGN_APPROACHES` in the schema, so what is promised here is what the
 * configurator will actually record against the project.
 */

const ICONS: Record<(typeof DESIGN_APPROACHES)[number], IconComponent> = {
  design_for_me: Sparkles,
  supplied_brand: Upload,
  existing_design: PenTool,
};

export async function DesignForMe() {
  const t = await getTranslations("home.design");

  return (
    <Section id="design" space="lg" surface="subtle" divided className="scroll-mt-20">
      <Container width="wide" className="flex flex-col gap-10 sm:gap-12">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        <ul className="grid gap-5 lg:grid-cols-3">
          {DESIGN_APPROACHES.map((approach) => (
            <li key={approach} className="flex">
              <Card padding="lg" className="flex flex-1 flex-col gap-3">
                <Icon icon={ICONS[approach]} size="lg" className="text-secondary" />
                <h3 className="text-display-sm text-primary">{t(`${approach}.title`)}</h3>
                <p className="flex-1 text-body-sm text-secondary">
                  {t(`${approach}.body`)}
                </p>
                <p className="text-caption text-tertiary">{t(`${approach}.note`)}</p>
              </Card>
            </li>
          ))}
        </ul>

        <p className="max-w-2xl text-body-sm text-secondary">{t("footnote")}</p>
      </Container>
    </Section>
  );
}
