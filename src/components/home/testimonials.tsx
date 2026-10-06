import { MessageSquareQuote, Star } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { Section, SectionHeading } from "@/components/layout/section";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { publishedReviews } from "@/server/growth/reviews";

/**
 * Customer reviews.
 *
 * Reads the reviews a customer wrote, a moderator approved, and somebody chose
 * to publish. Nothing else can reach this component: `publishedReviews`
 * filters on all three and selects only the columns the world may see.
 *
 * The empty state remains, and remains honest. A review is an assertion by a
 * named person about work they paid for; until one exists, saying so is more
 * persuasive to this product's buyer than invented praise would be.
 *
 * Names appear only where the customer consented, and the consent is checked
 * again at read time rather than trusted from when the review was written.
 */
export async function Testimonials() {
  const t = await getTranslations("home.testimonials");
  const tReview = await getTranslations("growth.reviews");

  const reviews = await publishedReviews();

  return (
    <Section id="reviews" space="lg" className="scroll-mt-20">
      <Container width="wide" className="flex flex-col gap-10">
        <SectionHeading
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        {reviews.length === 0 ? (
          <EmptyState
            size="sm"
            icon={<MessageSquareQuote className="size-6" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        ) : (
          <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {reviews.map((review) => (
              <li key={review.id} className="flex">
                <Card padding="lg" className="flex flex-1 flex-col gap-3">
                  <div
                    className="flex items-center gap-0.5"
                    aria-label={tReview("ratingValue", { rating: review.rating })}
                  >
                    {[1, 2, 3, 4, 5].map((value) => (
                      <Star
                        key={value}
                        aria-hidden
                        className={cn(
                          "size-4",
                          value <= review.rating ? "text-warning" : "text-tertiary",
                        )}
                        fill={value <= review.rating ? "currentColor" : "none"}
                      />
                    ))}
                  </div>

                  <blockquote className="text-body-sm text-secondary">
                    {review.body}
                  </blockquote>

                  {/* Unattributed where the customer did not agree to be
                      named, rather than attributed to "a customer", which
                      invites the reader to assume we made it up. */}
                  {review.authorName ? (
                    <p className="mt-auto text-caption text-tertiary">
                      {review.authorName}
                    </p>
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
