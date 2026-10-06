"use client";

import { useState, useTransition } from "react";

import { Star } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { retractReview, sendReview } from "@/server/growth-actions";

/**
 * Writing a review.
 *
 * Offered only once a build is live, because that is the only point at which
 * there is anything to review -- and the server refuses earlier regardless.
 *
 * Consent to publish is off by default and asked for plainly. A review
 * collected on the assumption it may be published is a review somebody did not
 * agree to give, and the name is only kept when they say so.
 */
export function ReviewForm({
  projectId,
  existing,
  canReview,
}: {
  projectId: string;
  existing: {
    status: string;
    rating: number | null;
    body: string | null;
    published: boolean;
    moderationNote: string | null;
  } | null;
  canReview: boolean;
}) {
  const t = useTranslations("growth.reviews");
  const { toast } = useToast();

  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [body, setBody] = useState(existing?.body ?? "");
  const [displayName, setDisplayName] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const written = existing !== null && existing.status !== "invited";

  function submit() {
    setError(null);
    start(async () => {
      const result = await sendReview(
        projectId,
        rating,
        body,
        displayName.trim() || null,
        consent,
      );
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast({ title: t("sent"), tone: "success" });
    });
  }

  if (!canReview) {
    return (
      <Card padding="lg">
        <p className="text-body-sm text-secondary">{t("notYet")}</p>
      </Card>
    );
  }

  if (written) {
    return (
      <Card padding="lg" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-eyebrow text-tertiary uppercase">{t("yours")}</span>
          <span className="flex items-center gap-2">
            <Badge tone={existing.published ? "success" : "neutral"}>
              {existing.published
                ? t("published")
                : t(`statusLabel.${existing.status as "submitted"}`)}
            </Badge>
            <span className="text-body-sm text-primary" data-numeric>
              {t("ratingValue", { rating: existing.rating ?? 0 })}
            </span>
          </span>
        </div>

        <p className="text-body-sm whitespace-pre-line text-secondary">{existing.body}</p>

        {existing.moderationNote ? (
          <Callout tone="warning" title={existing.moderationNote} />
        ) : null}

        {existing.status !== "withdrawn" ? (
          <Button
            variant="ghost"
            className="self-start"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await retractReview(projectId);
                toast({ title: t("statusLabel.withdrawn"), tone: "neutral" });
              })
            }
          >
            {t("withdraw")}
          </Button>
        ) : null}
      </Card>
    );
  }

  return (
    <Card padding="lg" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-body font-medium text-primary">{t("title")}</h3>
        <p className="text-body-sm text-secondary">{t("lede")}</p>
      </div>

      {error ? <Callout tone="danger" live title={error} /> : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-caption text-secondary">{t("rating")}</legend>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              // Each star is its own button with its own accessible name, so
              // the control is usable without seeing it.
              aria-label={t("ratingValue", { rating: value })}
              aria-pressed={rating === value}
              onClick={() => setRating(value)}
              className={cn(
                "rounded-sm p-1",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                value <= rating ? "text-warning" : "text-tertiary",
              )}
            >
              <Star
                className="size-6"
                fill={value <= rating ? "currentColor" : "none"}
                aria-hidden
              />
            </button>
          ))}
        </div>
      </fieldset>

      <Field label={t("body")}>
        <Textarea
          value={body}
          rows={4}
          maxLength={2000}
          placeholder={t("bodyPlaceholder")}
          onChange={(event) => setBody(event.target.value)}
        />
      </Field>

      <Checkbox
        label={t("consent")}
        description={t("consentHelp")}
        checked={consent}
        onChange={(event) => setConsent(event.target.checked)}
      />

      {consent ? (
        <Field label={t("displayName")}>
          <Input
            value={displayName}
            maxLength={120}
            placeholder={t("displayNamePlaceholder")}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </Field>
      ) : null}

      <Button
        className="self-start"
        disabled={pending || rating === 0 || body.trim().length < 10}
        onClick={submit}
      >
        {t("submit")}
      </Button>
    </Card>
  );
}

/**
 * Consent to appear on the build wall.
 *
 * Separate from the review on purpose: agreeing to be quoted and agreeing to
 * have your build shown are two different permissions, and bundling them would
 * mean neither was really given.
 */
export function ShowcaseConsent({
  projectId,
  consented,
  published,
  canConsent,
}: {
  projectId: string;
  consented: boolean;
  published: boolean;
  canConsent: boolean;
}) {
  const t = useTranslations("growth.showcase");
  const { toast } = useToast();
  const [nameConsent, setNameConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(consent: boolean, withName: boolean) {
    setError(null);
    start(async () => {
      const { setShowcaseConsent } = await import("@/server/growth-actions");
      const result = await setShowcaseConsent(projectId, consent, withName);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast({ title: consent ? t("consented") : t("withdraw"), tone: "success" });
    });
  }

  if (!canConsent) {
    return (
      <Card padding="lg">
        <p className="text-body-sm text-secondary">{t("notLaunched")}</p>
      </Card>
    );
  }

  return (
    <Card padding="lg" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-body font-medium text-primary">{t("title")}</h3>
        <p className="text-body-sm text-secondary">{t("body")}</p>
      </div>

      {error ? <Callout tone="danger" live title={error} /> : null}

      {consented ? (
        <div className="flex flex-col gap-3">
          <Badge tone="success">{published ? t("published") : t("consented")}</Badge>
          <Button
            variant="ghost"
            className="self-start"
            disabled={pending}
            onClick={() => run(false, false)}
          >
            {t("withdraw")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Checkbox
            label={t("nameConsent")}
            description={t("nameHelp")}
            checked={nameConsent}
            onChange={(event) => setNameConsent(event.target.checked)}
          />
          <Button
            className="self-start"
            disabled={pending}
            onClick={() => run(true, nameConsent)}
          >
            {t("consent")}
          </Button>
        </div>
      )}
    </Card>
  );
}
