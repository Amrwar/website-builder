"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import type { CaptureMode, PriceModel } from "@/config/validation";
import { VALIDATION_LIMITS } from "@/config/validation";
import { submitValidationLead } from "@/server/validation-actions";

/**
 * A validation landing page.
 *
 * One component for both places it appears -- the wizard's preview and the
 * public page -- so what the customer approves is exactly what visitors see.
 * It renders the customer's words and nothing else: no generated copy, no
 * invented testimonials, no "trusted by" row. A visitor is looking at an
 * idea, and the page says so at the bottom.
 */

export interface LandingContent {
  businessName: string;
  oneLiner: string;
  headline: string;
  details: string;
  benefits: readonly string[];
  targetCustomer: string;
  /** Already formatted in the page's locale, or null when not shown. */
  priceLabel: string | null;
  priceModel: PriceModel;
  availability: "now" | "soon";
  captureMode: CaptureMode;
}

export function LandingPage({
  content,
  lang,
  form,
  onCta,
}: {
  content: LandingContent;
  /** The language the customer wrote in, which may differ from the UI's. */
  lang: string;
  form: ReactNode;
  onCta?: () => void;
}) {
  const t = useTranslations("validationPage");
  const dir = lang === "ar" ? "rtl" : "ltr";

  return (
    <article className="flex flex-col gap-12">
      <header className="flex flex-col gap-5" lang={lang} dir={dir}>
        <p className="text-eyebrow text-tertiary uppercase">{content.businessName}</p>
        <h1 className="text-display-lg text-primary">{content.headline}</h1>
        <p className="max-w-2xl text-body-lg text-secondary">{content.oneLiner}</p>
        <div className="flex flex-wrap items-center gap-4">
          <Button
            size="lg"
            onClick={() => {
              onCta?.();
              document.getElementById("respond")?.scrollIntoView({ behavior: "smooth" });
              document.getElementById("respond-email")?.focus({ preventScroll: true });
            }}
          >
            {t(`cta.${content.captureMode}`)}
          </Button>
          {content.priceLabel ? (
            <p className="text-body text-primary">
              {t(`price.${content.priceModel as Exclude<PriceModel, "none">}`, {
                price: content.priceLabel,
              })}
            </p>
          ) : null}
        </div>
        {content.availability === "soon" ? (
          <p className="text-body-sm text-tertiary">{t("comingSoon")}</p>
        ) : null}
      </header>

      {content.details || content.benefits.length > 0 ? (
        <section className="grid gap-8 lg:grid-cols-2" lang={lang} dir={dir}>
          {content.details ? (
            <p className="text-body whitespace-pre-line text-secondary">
              {content.details}
            </p>
          ) : null}
          {content.benefits.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {content.benefits.map((benefit, index) => (
                <li key={index} className="flex items-start gap-3 text-body text-primary">
                  <Check aria-hidden className="mt-1 size-4 shrink-0 text-success" />
                  {benefit}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {content.targetCustomer ? (
        <p className="text-body-sm text-secondary" lang={lang} dir={dir}>
          {t("forWho", { who: content.targetCustomer })}
        </p>
      ) : null}

      <section
        id="respond"
        aria-labelledby="respond-title"
        className="flex scroll-mt-24 flex-col gap-4 rounded-lg border border-line p-6"
      >
        <h2 id="respond-title" className="text-display-xs text-primary">
          {t(`form.${content.captureMode}.title`)}
        </h2>
        <p className="text-body-sm text-secondary">
          {t(`form.${content.captureMode}.body`, { business: content.businessName })}
        </p>
        {form}
      </section>

      <footer className="border-t border-line-subtle pt-6 text-caption text-tertiary">
        {t("disclosure", { business: content.businessName })}
      </footer>
    </article>
  );
}

/* -------------------------------------------------------------------------
 * The live page's moving parts
 * ---------------------------------------------------------------------- */

function beacon(slug: string, kind: "view" | "cta_click") {
  const body = JSON.stringify({ kind });
  const url = `/api/v/${slug}/events`;
  // sendBeacon survives the visitor leaving the page mid-request; fetch with
  // keepalive is the fallback where it is unavailable.
  if (navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }))) return;
  void fetch(url, { method: "POST", body, keepalive: true }).catch(() => undefined);
}

/** Records one view per page load. Renders nothing. */
export function ViewBeacon({ slug }: { slug: string }) {
  useEffect(() => {
    beacon(slug, "view");
  }, [slug]);
  return null;
}

export function LiveLanding({
  slug,
  content,
  lang,
}: {
  slug: string;
  content: LandingContent;
  lang: string;
}) {
  return (
    <>
      <ViewBeacon slug={slug} />
      <LandingPage
        content={content}
        lang={lang}
        onCta={() => beacon(slug, "cta_click")}
        form={
          <LeadForm
            slug={slug}
            mode={content.captureMode}
            business={content.businessName}
          />
        }
      />
    </>
  );
}

type FormState = "idle" | "sent" | "invalid" | "closed" | "rate_limited" | "failed";

export function LeadForm({
  slug,
  mode,
  business,
  preview = false,
}: {
  slug: string;
  mode: CaptureMode;
  business: string;
  /** The wizard's copy: every field present, nothing submits. */
  preview?: boolean;
}) {
  const t = useTranslations("validationPage.form");
  const [state, setState] = useState<FormState>("idle");
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [company, setCompany] = useState("");

  if (state === "sent") {
    return (
      <Callout tone="success" title={t("sent.title")} live>
        {t(`sent.${mode}`, { business })}
      </Callout>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (preview) return;
        start(async () => {
          const result = await submitValidationLead(slug, {
            name,
            email,
            message,
            consent,
            company,
          });
          setState(result.ok ? "sent" : result.reason);
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("name")}>
          <Input
            value={name}
            maxLength={VALIDATION_LIMITS.leadName}
            autoComplete="name"
            disabled={preview}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label={t("email")} required>
          <Input
            id="respond-email"
            type="email"
            required
            value={email}
            maxLength={254}
            autoComplete="email"
            disabled={preview}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
      </div>
      {mode === "inquiry" ? (
        <Field label={t("message")}>
          <Textarea
            rows={4}
            value={message}
            maxLength={VALIDATION_LIMITS.leadMessage}
            disabled={preview}
            onChange={(event) => setMessage(event.target.value)}
          />
        </Field>
      ) : null}
      {/* Hidden from people and from assistive technology; only a script
          that fills every field it finds will put anything here. */}
      <div aria-hidden className="absolute -start-[9999px] size-px overflow-hidden">
        <label>
          Company
          <input
            tabIndex={-1}
            autoComplete="off"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
          />
        </label>
      </div>
      <Checkbox
        label={t("consent", { business })}
        checked={consent}
        required
        disabled={preview}
        onChange={(event) => setConsent(event.target.checked)}
      />
      {state !== "idle" ? (
        <Callout tone="warning" live>
          {t(`errors.${state}`)}
        </Callout>
      ) : null}
      <div>
        <Button type="submit" loading={pending} disabled={preview || !consent}>
          {t(`submit.${mode}`)}
        </Button>
      </div>
      <p className="text-caption text-tertiary">{t("privacy", { business })}</p>
    </form>
  );
}
