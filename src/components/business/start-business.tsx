"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ChoiceCard } from "@/components/ui/choice-card";
import { Field } from "@/components/ui/field";
import { CharacterCount, Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Stepper } from "@/components/ui/stepper";
import type {
  BusinessFeatureId,
  BusinessGoalId,
  RecommendationLevel,
} from "@/config/business";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { Link, useRouter } from "@/i18n/navigation";
import {
  draftFromBlueprint,
  initialSelection,
  recommend,
  validateDetails,
  type BusinessDetails,
  type FeatureRecommendation,
  type ResolvedBlueprint,
} from "@/lib/business/blueprint";
import {
  MAX_DESCRIPTION,
  MAX_SHORT_TEXT,
  MIN_DESCRIPTION,
} from "@/lib/configurator/draft";
import { readPrefill, serverPrefill, subscribePrefill } from "@/lib/business/prefill";
import { markHandoff, saveDraft } from "@/lib/configurator/storage";
import { guaranteedDays, totalPrice, type ProjectAssessment } from "@/lib/engine";
import { formatMoney } from "@/lib/pricing/money";
import type { StartPrefill } from "@/lib/validation/content";
import { assessDraft } from "@/server/configurator-actions";

/**
 * Start my business.
 *
 * Three questions -- what kind of business, a little about it, and which of
 * the usual pieces it wants -- and then the customer is in the ordinary
 * configurator with everything they said already filled in. Nothing about
 * pricing, ordering or delivery is reimplemented here: the estimate is the
 * configurator's own server action, and the result is a configurator draft.
 *
 * Everything the screen names -- blueprints, features, goals -- arrives as
 * props, already in the viewer's language, because a blueprint an
 * administrator created has its words in the database rather than in the
 * catalogues. Only this screen's own interface text is read here.
 */

export interface StartCatalog {
  categories: readonly { key: string; name: string }[];
  blueprints: readonly ResolvedBlueprint[];
  features: Readonly<Record<string, { name: string; description: string }>>;
  goals: readonly { id: BusinessGoalId; label: string }[];
}

const STEPS = ["business", "details", "recommend"] as const;
type StartStep = (typeof STEPS)[number];

const LEVELS: readonly RecommendationLevel[] = ["recommended", "optional", "not_needed"];

const EMPTY_DETAILS: BusinessDetails = {
  businessName: "",
  location: "",
  targetCustomers: "",
  offering: "",
  goals: [],
};

/** Long enough that ticking three boxes in a row prices once, not three times. */
const ESTIMATE_DELAY_MS = 600;

export function StartBusiness({ catalog }: { catalog: StartCatalog }) {
  // An idea carried over from Test my business idea, if the customer just
  // clicked "Turn this into my business". Null on the server and on any
  // other arrival; when it appears after hydration the flow remounts with it.
  const prefill = useSyncExternalStore(subscribePrefill, readPrefill, serverPrefill);
  return (
    <StartBusinessFlow
      key={prefill ? "prefilled" : "blank"}
      catalog={catalog}
      initial={prefill}
    />
  );
}

function StartBusinessFlow({
  catalog,
  initial,
}: {
  catalog: StartCatalog;
  initial: StartPrefill | null;
}) {
  const t = useTranslations("startBusiness");
  const locale = resolveLocale(useLocale());
  const { intlTag } = getLocaleDefinition(locale);
  const router = useRouter();

  // A blueprint the idea named is used only if it is still offered.
  const initialBlueprint =
    initial?.blueprintKey &&
    catalog.blueprints.some((entry) => entry.key === initial.blueprintKey)
      ? initial.blueprintKey
      : null;
  const [step, setStep] = useState<StartStep>(initialBlueprint ? "details" : "business");
  const [blueprintKey, setBlueprintKey] = useState<string | null>(initialBlueprint);
  const [details, setDetails] = useState<BusinessDetails>(() =>
    initial
      ? {
          ...EMPTY_DETAILS,
          businessName: initial.businessName,
          targetCustomers: initial.targetCustomers,
          offering: initial.offering,
        }
      : EMPTY_DETAILS,
  );
  const [selected, setSelected] = useState<BusinessFeatureId[]>([]);
  const [attempted, setAttempted] = useState(false);

  const blueprint =
    catalog.blueprints.find((entry) => entry.key === blueprintKey) ?? null;
  const recommendations = useMemo(
    () => (blueprint ? recommend(blueprint, details.goals) : []),
    [blueprint, details.goals],
  );

  const goalSummary = details.goals
    .map((id) => catalog.goals.find((goal) => goal.id === id)?.label)
    .filter(Boolean)
    .join(", ");

  const draft = useMemo(
    () =>
      blueprint
        ? draftFromBlueprint({ blueprint, details, selected, locale, goalSummary })
        : null,
    [blueprint, details, selected, locale, goalSummary],
  );

  /* --- Estimate --------------------------------------------------------- */

  const [assessment, setAssessment] = useState<ProjectAssessment | null>(null);
  const [estimateFailed, setEstimateFailed] = useState(false);
  const [estimating, startEstimating] = useTransition();
  // Answers can arrive out of order; only the newest request may land.
  const latestRequest = useRef(0);

  useEffect(() => {
    if (step !== "recommend" || !draft) return;
    const request = ++latestRequest.current;
    const timer = window.setTimeout(() => {
      startEstimating(async () => {
        const result = await assessDraft(draft, null);
        if (request !== latestRequest.current) return;
        if (result.ok) {
          setAssessment(result.assessment);
          setEstimateFailed(false);
        } else {
          setAssessment(null);
          setEstimateFailed(true);
        }
      });
    }, ESTIMATE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [step, draft]);

  /* --- Navigation ------------------------------------------------------- */

  const issue =
    step === "business"
      ? blueprint
        ? null
        : "chooseBusiness"
      : step === "details"
        ? validateDetails(details)
        : null;

  function goTo(next: StartStep) {
    setStep(next);
    setAttempted(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goNext() {
    if (issue) {
      setAttempted(true);
      return;
    }
    if (step === "business") goTo("details");
    if (step === "details") {
      // Re-derived on every entry, so a goal added on the way back through
      // is reflected. It does replace any ticks made earlier -- the price of
      // keeping "recommended" meaning what the rule says it means.
      if (blueprint) setSelected(initialSelection(recommend(blueprint, details.goals)));
      goTo("recommend");
    }
  }

  function goBack() {
    const index = STEPS.indexOf(step);
    const previous = STEPS[index - 1];
    if (previous) goTo(previous);
  }

  function continueToConfigurator() {
    if (!draft) return;
    saveDraft(draft);
    markHandoff();
    router.push("/configure");
  }

  function toggle(id: BusinessFeatureId) {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function setDetail<K extends keyof BusinessDetails>(key: K, value: BusinessDetails[K]) {
    setDetails((current) => ({ ...current, [key]: value }));
  }

  const index = STEPS.indexOf(step);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <p className="text-eyebrow text-tertiary uppercase">{t("eyebrow")}</p>
        <h1 className="text-display-lg text-primary">{t(`steps.${step}.title`)}</h1>
        <p className="max-w-2xl text-body text-secondary">{t(`steps.${step}.lead`)}</p>
      </header>

      {initial && step !== "recommend" ? (
        <Callout tone="info" title={t("fromValidation.title")}>
          {t("fromValidation.body")}
        </Callout>
      ) : null}

      <Stepper
        steps={STEPS.map((id) => ({ id, label: t(`steps.${id}.label`) }))}
        current={index}
        label={t("progressLabel")}
        statusLabel={(status) => t(`status.${status}`)}
      />

      {step === "business" ? (
        <ChooseBusiness
          catalog={catalog}
          value={blueprintKey}
          onChange={(key) => {
            setBlueprintKey(key);
            setSelected([]);
          }}
        />
      ) : null}

      {step === "details" && blueprint ? (
        <BusinessDetailsForm
          details={details}
          goals={catalog.goals}
          blueprintName={blueprint.name}
          showErrors={attempted}
          onChange={setDetail}
        />
      ) : null}

      {step === "recommend" && blueprint ? (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Recommendations
            recommendations={recommendations}
            features={catalog.features}
            goals={catalog.goals}
            selected={selected}
            onToggle={toggle}
          />
          <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
            <Estimate
              assessment={assessment}
              failed={estimateFailed}
              pending={estimating || (!assessment && !estimateFailed)}
              intlTag={intlTag}
              count={selected.length}
            />
            <Button
              size="lg"
              disabled={selected.length === 0}
              endIcon={<ArrowRight className="rtl-flip size-4" />}
              onClick={continueToConfigurator}
            >
              {t("continue")}
            </Button>
            <p className="text-caption text-tertiary">{t("continueNote")}</p>
          </aside>
        </div>
      ) : null}

      {attempted && issue ? (
        <Callout tone="warning" live>
          {t(`issues.${issue}`, { min: MIN_DESCRIPTION })}
        </Callout>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle pt-6">
        {index > 0 ? (
          <Button
            variant="ghost"
            startIcon={<ArrowLeft className="rtl-flip size-4" />}
            onClick={goBack}
          >
            {t("back")}
          </Button>
        ) : (
          <span />
        )}
        {step !== "recommend" ? (
          <Button endIcon={<ArrowRight className="rtl-flip size-4" />} onClick={goNext}>
            {t("next")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Step 1 — the business
 * ---------------------------------------------------------------------- */

function ChooseBusiness({
  catalog,
  value,
  onChange,
}: {
  catalog: StartCatalog;
  value: string | null;
  onChange: (key: string) => void;
}) {
  const t = useTranslations("startBusiness");

  if (catalog.blueprints.length === 0) {
    return <Callout tone="info">{t("noBlueprints")}</Callout>;
  }

  return (
    <div className="flex flex-col gap-8">
      {catalog.categories.map((category) => {
        const items = catalog.blueprints.filter(
          (entry) => entry.categoryKey === category.key,
        );
        if (items.length === 0) return null;
        return (
          <fieldset key={category.key} className="flex flex-col gap-3">
            <legend className="mb-3 text-eyebrow text-tertiary uppercase">
              {category.name}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((entry) => (
                <ChoiceCard
                  key={entry.key}
                  name="blueprint"
                  value={entry.key}
                  checked={value === entry.key}
                  onChange={() => onChange(entry.key)}
                  title={entry.name}
                  description={entry.summary}
                />
              ))}
            </div>
          </fieldset>
        );
      })}
      <p className="text-body-sm text-tertiary">{t("notListed")}</p>
      <p className="text-body-sm text-secondary">
        {t("testFirst")}{" "}
        <Link href="/validate" className="font-medium text-accent hover:underline">
          {t("testFirstLink")}
        </Link>
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Step 2 — about it
 * ---------------------------------------------------------------------- */

function BusinessDetailsForm({
  details,
  goals,
  blueprintName,
  showErrors,
  onChange,
}: {
  details: BusinessDetails;
  goals: StartCatalog["goals"];
  blueprintName: string;
  showErrors: boolean;
  onChange: <K extends keyof BusinessDetails>(key: K, value: BusinessDetails[K]) => void;
}) {
  const t = useTranslations("startBusiness.details");
  const tooShort =
    details.offering.length > 0 && details.offering.trim().length < MIN_DESCRIPTION;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          label={t("businessName.label")}
          required
          error={
            showErrors && details.businessName.trim() === ""
              ? t("businessName.required")
              : undefined
          }
        >
          <Input
            value={details.businessName}
            maxLength={MAX_SHORT_TEXT}
            autoComplete="organization"
            onChange={(event) => onChange("businessName", event.target.value)}
          />
        </Field>
        <Field label={t("location.label")} description={t("location.help")}>
          <Input
            value={details.location}
            maxLength={MAX_SHORT_TEXT}
            autoComplete="address-level2"
            onChange={(event) => onChange("location", event.target.value)}
          />
        </Field>
      </div>

      <Field label={t("targetCustomers.label")} description={t("targetCustomers.help")}>
        <Input
          value={details.targetCustomers}
          maxLength={MAX_SHORT_TEXT}
          onChange={(event) => onChange("targetCustomers", event.target.value)}
        />
      </Field>

      <div className="flex flex-col gap-2">
        <Field
          label={t("offering.label")}
          description={t("offering.help", { business: blueprintName })}
          required
          error={
            tooShort || (showErrors && details.offering.trim().length < MIN_DESCRIPTION)
              ? t("offering.tooShort", { min: MIN_DESCRIPTION })
              : undefined
          }
        >
          <Textarea
            value={details.offering}
            rows={5}
            maxLength={MAX_DESCRIPTION}
            onChange={(event) => onChange("offering", event.target.value)}
          />
        </Field>
        <CharacterCount
          value={details.offering}
          max={MAX_DESCRIPTION}
          label={(remaining) => t("offering.remaining", { remaining })}
        />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-body-sm font-medium text-primary">
          {t("goals.label")}
        </legend>
        <p className="text-body-sm text-secondary">{t("goals.help")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {goals.map((goal) => (
            <Checkbox
              key={goal.id}
              label={goal.label}
              checked={details.goals.includes(goal.id)}
              onChange={() =>
                onChange(
                  "goals",
                  details.goals.includes(goal.id)
                    ? details.goals.filter((id) => id !== goal.id)
                    : [...details.goals, goal.id],
                )
              }
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Step 3 — what it needs
 * ---------------------------------------------------------------------- */

function Recommendations({
  recommendations,
  features,
  goals,
  selected,
  onToggle,
}: {
  recommendations: readonly FeatureRecommendation[];
  features: StartCatalog["features"];
  goals: StartCatalog["goals"];
  selected: readonly BusinessFeatureId[];
  onToggle: (id: BusinessFeatureId) => void;
}) {
  const t = useTranslations("startBusiness.recommend");
  const goalLabel = (id: BusinessGoalId) =>
    goals.find((goal) => goal.id === id)?.label ?? id;

  return (
    <div className="flex flex-col gap-10">
      {LEVELS.map((level) => {
        const items = recommendations.filter((entry) => entry.level === level);
        if (items.length === 0) return null;

        const list = (
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map(({ feature, promotedBy }) => {
              const id = feature.id as BusinessFeatureId;
              const copy = features[id];
              return (
                <Checkbox
                  key={id}
                  label={copy?.name ?? id}
                  description={
                    <span className="flex flex-col gap-1">
                      <span>{copy?.description}</span>
                      <span className="text-caption text-tertiary">
                        {t(`kind.${feature.kind}`)} · {t(`audience.${feature.audience}`)}
                      </span>
                      {promotedBy.length > 0 ? (
                        <span className="text-caption text-info">
                          {t("because", { goals: promotedBy.map(goalLabel).join(", ") })}
                        </span>
                      ) : null}
                    </span>
                  }
                  checked={selected.includes(id)}
                  onChange={() => onToggle(id)}
                />
              );
            })}
          </div>
        );

        return (
          <section
            key={level}
            className="flex flex-col gap-4"
            aria-labelledby={`level-${level}`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <h2 id={`level-${level}`} className="text-display-sm text-primary">
                {t(`levels.${level}.title`)}
              </h2>
              <Badge tone={level === "recommended" ? "success" : "neutral"}>
                {t("count", { count: items.length })}
              </Badge>
            </div>
            <p className="max-w-2xl text-body-sm text-secondary">
              {t(`levels.${level}.body`)}
            </p>
            {level === "not_needed" ? (
              // Collapsed: a long list of things this business does not need
              // should not push the summary off the screen. Still all there.
              <details className="group">
                <summary className="cursor-pointer rounded-sm text-body-sm text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                  {t("showNotNeeded", { count: items.length })}
                </summary>
                <div className="pt-4">{list}</div>
              </details>
            ) : (
              list
            )}
          </section>
        );
      })}
      <p className="text-caption text-tertiary">{t("ruleBased")}</p>
    </div>
  );
}

function Estimate({
  assessment,
  failed,
  pending,
  intlTag,
  count,
}: {
  assessment: ProjectAssessment | null;
  failed: boolean;
  pending: boolean;
  intlTag: string;
  count: number;
}) {
  const t = useTranslations("startBusiness.estimate");

  const quote = assessment?.requiresCustomQuote ?? false;
  const total = assessment ? totalPrice(assessment) : null;
  const days = assessment ? guaranteedDays(assessment) : null;

  return (
    <Card
      padding="md"
      className="flex flex-col gap-4"
      aria-live="polite"
      aria-busy={pending}
    >
      <p className="text-eyebrow text-tertiary uppercase">{t("title")}</p>
      {failed ? (
        <p className="text-body-sm text-secondary">{t("failed")}</p>
      ) : !assessment ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
      ) : (
        <dl className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <dt className="text-caption text-tertiary">{t("price")}</dt>
            <dd className="text-display-sm text-primary tabular-nums">
              {quote || !total
                ? t("quote")
                : formatMoney(total, intlTag, { trimWholeDecimals: true })}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-caption text-tertiary">{t("time")}</dt>
            <dd className="text-body text-primary">
              {quote || days === null ? t("quoted") : t("days", { days })}
            </dd>
          </div>
        </dl>
      )}
      <p className="text-caption text-tertiary">
        {t("selected", { count })} {quote ? t("quoteNote") : t("note")}
      </p>
      {assessment?.delivery.externalReviewExcluded ? (
        // Wherever a mobile delivery time is stated, so is this.
        <p className="text-caption text-tertiary">{t("storeReview")}</p>
      ) : null}
    </Card>
  );
}
