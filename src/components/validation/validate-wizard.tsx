"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { ChoiceCard } from "@/components/ui/choice-card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Stepper } from "@/components/ui/stepper";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import {
  AVAILABILITIES,
  CAPTURE_MODES,
  MIN_VISITORS_FOR_READING,
  PRICE_MODELS,
  VALIDATION_LIMITS as L,
  defaultCaptureMode,
} from "@/config/validation";
import { Link, useRouter } from "@/i18n/navigation";
import { SUPPORTED_CURRENCIES, fromMajorUnits, type Currency } from "@/lib/pricing/money";
import {
  VALIDATION_STEPS,
  validateStep,
  type ValidationContent,
  type ValidationStep,
} from "@/lib/validation/content";
import {
  clearDraft,
  getServerSnapshot,
  getSnapshot,
  restoreDraft,
  subscribe,
  updateDraft,
} from "@/lib/validation/draft-store";
import { landingContent } from "@/lib/validation/landing";
import { publishValidation, type PublishActionResult } from "@/server/validation-actions";
import { LandingPage, LeadForm } from "./landing-page";

/**
 * Test my business idea.
 *
 * A guided wizard that ends in a real, public page. Every step is the
 * customer's own words; nothing is written for them. The preview step
 * renders the actual landing component, so there is no difference between
 * what is approved and what is published.
 */

const NONE = "__none__";

export function ValidateWizard({
  blueprints,
}: {
  /** Business-in-a-Box blueprints, for "closest to", already translated. */
  blueprints: readonly { key: string; name: string }[];
}) {
  const t = useTranslations("validate");
  const locale = resolveLocale(useLocale());
  const { intlTag } = getLocaleDefinition(locale);
  const router = useRouter();

  const draft = useSyncExternalStore(
    subscribe,
    () => getSnapshot(locale),
    () => getServerSnapshot(locale),
  );
  useEffect(() => restoreDraft(locale), [locale]);

  const [step, setStep] = useState<ValidationStep>("idea");
  const [attempted, setAttempted] = useState(false);
  const [publishing, startPublishing] = useTransition();
  const [publishFailure, setPublishFailure] = useState<
    Exclude<PublishActionResult, { ok: true }>["reason"] | null
  >(null);

  const index = VALIDATION_STEPS.indexOf(step);
  const issue = validateStep(step, draft);

  const update = (recipe: (current: ValidationContent) => ValidationContent) =>
    updateDraft(recipe, locale);
  const set = <K extends keyof ValidationContent>(key: K, value: ValidationContent[K]) =>
    update((current) => ({ ...current, [key]: value }));

  function goTo(next: ValidationStep) {
    setStep(next);
    setAttempted(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goNext() {
    if (issue) {
      setAttempted(true);
      return;
    }
    const next = VALIDATION_STEPS[index + 1];
    if (next) goTo(next);
  }

  function publish() {
    setPublishFailure(null);
    startPublishing(async () => {
      const result = await publishValidation(draft);
      if (result.ok) {
        clearDraft(locale);
        router.push(`/ideas/${result.id}`);
        return;
      }
      setPublishFailure(result.reason);
    });
  }

  const preview = landingContent(
    draft,
    {
      model: draft.price.model,
      minorUnits:
        draft.price.amount && draft.price.model !== "none"
          ? fromMajorUnits(draft.price.amount, draft.price.currency as Currency)
              .minorUnits
          : null,
      currency: draft.price.currency as Currency,
    },
    intlTag,
  );

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <p className="text-eyebrow text-tertiary uppercase">{t("eyebrow")}</p>
        <h1 className="text-display-lg text-primary">{t(`steps.${step}.title`)}</h1>
        <p className="max-w-2xl text-body text-secondary">{t(`steps.${step}.lead`)}</p>
      </header>

      <Stepper
        steps={VALIDATION_STEPS.map((id) => ({ id, label: t(`steps.${id}.label`) }))}
        current={index}
        label={t("progressLabel")}
        statusLabel={(status) => t(`status.${status}`)}
      />

      {step === "idea" ? (
        <div className="flex flex-col gap-6">
          <Field
            label={t("fields.businessName")}
            description={t("fields.businessNameHelp")}
            required
          >
            <Input
              value={draft.businessName}
              maxLength={L.name}
              onChange={(event) => set("businessName", event.target.value)}
            />
          </Field>
          <Field
            label={t("fields.oneLiner")}
            description={t("fields.oneLinerHelp")}
            required
          >
            <Input
              value={draft.oneLiner}
              maxLength={L.oneLiner}
              onChange={(event) => set("oneLiner", event.target.value)}
            />
          </Field>
          <Field label={t("fields.closest")} description={t("fields.closestHelp")}>
            <Select
              value={draft.blueprintKey ?? NONE}
              onValueChange={(value) =>
                set("blueprintKey", value === NONE ? null : value)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("fields.closestNone")}</SelectItem>
                {blueprints.map((blueprint) => (
                  <SelectItem key={blueprint.key} value={blueprint.key}>
                    {blueprint.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      ) : null}

      {step === "description" ? (
        <Field
          label={t("fields.description")}
          description={t("fields.descriptionHelp")}
          required
        >
          <Textarea
            rows={7}
            value={draft.description}
            maxLength={L.description}
            onChange={(event) => set("description", event.target.value)}
          />
        </Field>
      ) : null}

      {step === "customer" ? (
        <div className="flex flex-col gap-6">
          <Field
            label={t("fields.targetCustomer")}
            description={t("fields.targetCustomerHelp")}
            required
          >
            <Input
              value={draft.targetCustomer}
              maxLength={L.customer}
              onChange={(event) => set("targetCustomer", event.target.value)}
            />
          </Field>
          <Field label={t("fields.problem")} description={t("fields.problemHelp")}>
            <Textarea
              rows={4}
              value={draft.problem}
              maxLength={L.problem}
              onChange={(event) => set("problem", event.target.value)}
            />
          </Field>
        </div>
      ) : null}

      {step === "offer" ? (
        <div className="flex flex-col gap-6">
          <Field
            label={t("fields.headline")}
            description={t("fields.headlineHelp")}
            required
          >
            <Input
              value={draft.headline}
              maxLength={L.headline}
              onChange={(event) => set("headline", event.target.value)}
            />
          </Field>
          <Field label={t("fields.details")} description={t("fields.detailsHelp")}>
            <Textarea
              rows={5}
              value={draft.details}
              maxLength={L.details}
              onChange={(event) => set("details", event.target.value)}
            />
          </Field>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-body-sm font-medium text-primary">
              {t("fields.benefits")}
            </legend>
            {Array.from({ length: L.maxBenefits }, (_, i) => (
              <Input
                key={i}
                aria-label={t("fields.benefitN", { n: i + 1 })}
                value={draft.benefits[i] ?? ""}
                maxLength={L.benefit}
                onChange={(event) =>
                  update((current) => {
                    const benefits = Array.from({ length: L.maxBenefits }, (_, j) =>
                      j === i ? event.target.value : (current.benefits[j] ?? ""),
                    );
                    // Stored without the blanks, so an empty box is not a
                    // bullet with nothing in it.
                    return {
                      ...current,
                      benefits: benefits.filter((b) => b.trim() !== ""),
                    };
                  })
                }
              />
            ))}
          </fieldset>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-body-sm font-medium text-primary">
              {t("fields.availability")}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {AVAILABILITIES.map((value) => (
                <ChoiceCard
                  key={value}
                  name="availability"
                  value={value}
                  checked={draft.availability === value}
                  onChange={() =>
                    update((current) => ({
                      ...current,
                      availability: value,
                      captureMode: defaultCaptureMode(value),
                    }))
                  }
                  title={t(`availability.${value}.title`)}
                  description={t(`availability.${value}.body`)}
                />
              ))}
            </div>
          </fieldset>
        </div>
      ) : null}

      {step === "pricing" ? (
        <div className="flex flex-col gap-6">
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-body-sm font-medium text-primary">
              {t("fields.priceModel")}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {PRICE_MODELS.map((model) => (
                <ChoiceCard
                  key={model}
                  name="priceModel"
                  value={model}
                  checked={draft.price.model === model}
                  onChange={() => set("price", { ...draft.price, model })}
                  title={t(`priceModels.${model}.title`)}
                  description={t(`priceModels.${model}.body`)}
                />
              ))}
            </div>
          </fieldset>
          {draft.price.model !== "none" ? (
            <div className="grid gap-6 sm:grid-cols-2">
              <Field label={t("fields.amount")} required>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={draft.price.amount ?? ""}
                  onChange={(event) =>
                    set("price", {
                      ...draft.price,
                      amount:
                        event.target.value === "" ? null : Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field label={t("fields.currency")}>
                <Select
                  value={draft.price.currency}
                  onValueChange={(currency) => set("price", { ...draft.price, currency })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_CURRENCIES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          ) : null}
          <p className="text-body-sm text-tertiary">{t("pricingNote")}</p>
        </div>
      ) : null}

      {step === "landing" ? (
        <div className="flex flex-col gap-4">
          <p className="text-body-sm text-secondary">{t("previewNote")}</p>
          <div className="rounded-xl border border-line-strong p-6 sm:p-10">
            <LandingPage
              content={preview}
              lang={draft.locale}
              form={
                <LeadForm
                  slug="preview"
                  mode={draft.captureMode}
                  business={draft.businessName}
                  preview
                />
              }
            />
          </div>
        </div>
      ) : null}

      {step === "capture" ? (
        <div className="flex flex-col gap-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {CAPTURE_MODES.map((mode) => (
              <ChoiceCard
                key={mode}
                name="captureMode"
                value={mode}
                checked={draft.captureMode === mode}
                onChange={() => set("captureMode", mode)}
                title={t(`capture.${mode}.title`)}
                description={t(`capture.${mode}.body`)}
                meta={
                  defaultCaptureMode(draft.availability) === mode
                    ? t(`capture.suggested.${draft.availability}`)
                    : undefined
                }
              />
            ))}
          </div>
          <section className="flex flex-col gap-2">
            <h2 className="text-display-xs text-primary">{t("measured.title")}</h2>
            <ul className="flex list-disc flex-col gap-1 ps-5 text-body-sm text-secondary">
              <li>{t("measured.visitors")}</li>
              <li>{t("measured.clicks")}</li>
              <li>{t(`measured.${draft.captureMode}`)}</li>
              <li>{t("measured.conversion")}</li>
            </ul>
            <p className="text-body-sm text-tertiary">{t("measured.privacy")}</p>
          </section>
        </div>
      ) : null}

      {step === "publish" ? (
        <div className="flex flex-col gap-6">
          <Callout tone="info" title={t("honesty.title")}>
            {t("honesty.body", { min: MIN_VISITORS_FOR_READING })}
          </Callout>
          <ul className="flex list-disc flex-col gap-1 ps-5 text-body-sm text-secondary">
            <li>{t("publishFacts.public")}</li>
            <li>{t("publishFacts.frozen")}</li>
            <li>{t("publishFacts.limit", { max: L.maxLive })}</li>
          </ul>
          {publishFailure === "signed_out" ? (
            <Callout
              tone="warning"
              title={t("signedOut.title")}
              action={
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/sign-up?redirect_url=${encodeURIComponent("/validate")}`}
                    className="text-body-sm font-medium text-accent hover:underline"
                  >
                    {t("signedOut.signUp")}
                  </Link>
                  <Link
                    href={`/sign-in?redirect_url=${encodeURIComponent("/validate")}`}
                    className="text-body-sm font-medium text-accent hover:underline"
                  >
                    {t("signedOut.signIn")}
                  </Link>
                </div>
              }
            >
              {t("signedOut.body")}
            </Callout>
          ) : publishFailure ? (
            <Callout tone="warning" live>
              {t(
                `publishFailure.${publishFailure as Exclude<typeof publishFailure, "signed_out" | null>}`,
                {
                  max: L.maxLive,
                },
              )}
            </Callout>
          ) : null}
          <div>
            <Button size="lg" loading={publishing} onClick={publish}>
              {t("publish")}
            </Button>
          </div>
        </div>
      ) : null}

      {attempted && issue ? (
        <Callout tone="warning" live>
          {t(`issues.${issue}`, { min: L.minDescription })}
        </Callout>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle pt-6">
        {index > 0 ? (
          <Button
            variant="ghost"
            startIcon={<ArrowLeft className="rtl-flip size-4" />}
            onClick={() => {
              const previous = VALIDATION_STEPS[index - 1];
              if (previous) goTo(previous);
            }}
          >
            {t("back")}
          </Button>
        ) : (
          <span />
        )}
        {step !== "publish" ? (
          <Button endIcon={<ArrowRight className="rtl-flip size-4" />} onClick={goNext}>
            {t("next")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
