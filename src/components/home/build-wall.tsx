import { LayoutGrid } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { Section, SectionHeading } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";
import { publishedShowcase } from "@/server/growth/showcase";

/**
 * Public build wall.
 *
 * Reads the published entries and renders them; renders the honest empty state
 * when there are none. The empty state is not a placeholder waiting to be
 * replaced — it is the zero case of the same component, and it is what visitors
 * see until there is genuinely something to show.
 *
 * Every field here came from `publishedShowcase`, which selects named columns
 * and never joins to a customer record. This component therefore cannot leak
 * private information even if somebody later adds a field to it carelessly:
 * there is nothing private in what it receives.
 */
export async function BuildWall() {
  const t = await getTranslations("home.buildWall");
  const tWall = await getTranslations("growth.buildWallPage");

  const entries = await publishedShowcase();

  return (
    <Section id="build-wall" space="lg" className="scroll-mt-20">
      <Container width="wide" className="flex flex-col gap-10 sm:gap-12">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        {entries.length === 0 ? (
          <EmptyState
            icon={<LayoutGrid className="size-6" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            action={
              <Link
                href="/configure"
                className={buttonVariants({ variant: "secondary" })}
              >
                {t("emptyCta")}
              </Link>
            }
          />
        ) : (
          <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {entries.map((entry) => (
              <li key={entry.id} className="flex">
                <Card padding="lg" className="flex flex-1 flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{entry.buildType}</Badge>
                    {entry.deliveredInDays ? (
                      <span className="text-caption text-tertiary">
                        {tWall("deliveredIn", { days: entry.deliveredInDays })}
                      </span>
                    ) : null}
                  </div>

                  <h3 className="text-body font-semibold text-primary">{entry.title}</h3>
                  <p className="text-body-sm text-secondary">{entry.summary}</p>

                  {entry.industry ? (
                    <p className="text-caption text-tertiary">
                      {tWall("industry")}: {entry.industry}
                    </p>
                  ) : null}

                  {entry.technologies.length > 0 ? (
                    <p className="text-caption text-tertiary">
                      {tWall("built")}: {entry.technologies.join(", ")}
                    </p>
                  ) : null}

                  {/* Quoted only when the review behind it is published and
                      the customer consented to be named. */}
                  {entry.testimonial ? (
                    <figure className="mt-auto flex flex-col gap-1 border-t border-line-subtle pt-3">
                      <blockquote className="text-body-sm text-secondary">
                        {entry.testimonial.body}
                      </blockquote>
                      {entry.testimonial.authorName ? (
                        <figcaption className="text-caption text-tertiary">
                          {entry.testimonial.authorName}
                        </figcaption>
                      ) : null}
                    </figure>
                  ) : null}

                  {entry.customerLabel ? (
                    <p className="text-caption text-tertiary">{entry.customerLabel}</p>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </Section>
  );
}
