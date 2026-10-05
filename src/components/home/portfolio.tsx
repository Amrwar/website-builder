import { FolderOpen } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { Section, SectionHeading } from "@/components/layout/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";

/**
 * Portfolio.
 *
 * Distinct from the build wall above it: the wall is a live feed of what is
 * being produced, this is a small set of finished work written up in depth.
 *
 * Empty, and honestly so. Inventing case studies for builds that do not exist
 * would undermine the one thing this page is actually selling, which is that
 * the numbers on it are true. The section renders its zero state until there
 * is real work to show.
 */
export async function Portfolio() {
  const t = await getTranslations("home.portfolio");

  return (
    <Section id="portfolio" space="lg" surface="subtle" divided className="scroll-mt-20">
      <Container width="wide" className="flex flex-col gap-10">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        <EmptyState
          size="sm"
          icon={<FolderOpen className="size-6" />}
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
