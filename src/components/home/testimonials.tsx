import { MessageSquareQuote } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { Section, SectionHeading } from "@/components/layout/section";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Customer reviews.
 *
 * Deliberately empty. There are no customers yet, and a fabricated quote
 * attributed to a person who does not exist is a lie on the one page whose
 * entire argument is that its claims can be checked.
 *
 * The copy says plainly that reviews appear once builds are delivered, which
 * is more persuasive to the kind of buyer this product is for than invented
 * praise would be.
 */
export async function Testimonials() {
  const t = await getTranslations("home.testimonials");

  return (
    <Section id="reviews" space="lg" className="scroll-mt-20">
      <Container width="wide" className="flex flex-col gap-10">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        <EmptyState
          size="sm"
          icon={<MessageSquareQuote className="size-6" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      </Container>
    </Section>
  );
}
