import { LayoutGrid } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { Section, SectionHeading } from "@/components/layout/section";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";

/**
 * Public build wall.
 *
 * Currently empty, and genuinely so: there are no completed builds yet, and
 * populating this with invented examples would be the exact dishonesty the
 * scope section argues against. When the projects table exists this section
 * queries it and renders cards; the empty state stays as the zero case.
 */
export async function BuildWall() {
  const t = await getTranslations("home.buildWall");

  return (
    <Section id="build-wall" space="lg" className="scroll-mt-20">
      <Container width="wide" className="flex flex-col gap-10 sm:gap-12">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        <EmptyState
          icon={<LayoutGrid className="size-6" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
          action={
            <Link href="/configure" className={buttonVariants({ variant: "secondary" })}>
              {t("emptyCta")}
            </Link>
          }
        />
      </Container>
    </Section>
  );
}
