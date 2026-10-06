"use client";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";

import { ArrowLeft, ArrowRight, Check, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { assessDraft } from "@/server/configurator-actions";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Stepper } from "@/components/ui/stepper";
import { resolveLocale } from "@/config/locales";
import {
  STEP_IDS,
  firstUnsatisfiedStep,
  stepIndex,
  validateStep,
  type ConfiguratorDraft,
  type StepId,
} from "@/lib/configurator/draft";
import {
  acknowledgeResume,
  ensureInitialised,
  getServerSnapshot,
  getSnapshot,
  resetDraft,
  restoreSaved,
  subscribe,
  updateDraft,
} from "@/lib/configurator/store";
import { cn } from "@/lib/cn";
import type { ProjectAssessment } from "@/lib/engine";
import { StepDesign } from "./step-design";
import { StepFeatures } from "./step-features";
import { StepIntake } from "./step-intake";
import { StepPlatform } from "./step-platform";
import { StepReview } from "./step-review";
import { StepScopeResult } from "./step-scope";
import { StepStart } from "./step-start";
import { StepType } from "./step-type";

/** Steps that need a completed assessment to render anything. */
const DERIVED_STEPS: readonly StepId[] = ["scope", "review", "start"];

/**
 * Build configurator.
 *
 * A sequence of decisions rather than a long form: one question per screen,
 * every answer visible in the summary, and nothing asked twice.
 *
 * The assessment runs when the customer crosses into the derived steps, from
 * the navigation handler rather than from an effect. That keeps the request
 * tied to the action that caused it, and avoids a render-then-fetch cascade on
 * a screen the customer is waiting on.
 *
 * The current step is deliberately not persisted. Resuming is offered as an
 * explicit choice rather than silently dropping someone back into the middle
 * of a flow they may have left on purpose.
 */
export function Configurator() {
  const t = useTranslations("configurator");
  // From the provider, so the page that renders this need not be async.
  const locale = resolveLocale(useLocale());

  // Prepared during render so the first committed snapshot is already correct.
  ensureInitialised(locale);
  const { draft, resumedFrom, saveState } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => getServerSnapshot(locale),
  );

  // Storage is browser-only, so the saved draft is read after hydration.
  // `restoreSaved` publishes through the store, not through component state.
  useEffect(() => {
    restoreSaved();
  }, []);

  const [step, setStep] = useState<StepId>("type");
  const [attempted, setAttempted] = useState(false);
  const [assessment, setAssessment] = useState<ProjectAssessment | null>(null);
  const [assessFailed, setAssessFailed] = useState(false);
  /**
   * A coupon the customer typed. Held outside the draft on purpose: it is a
   * commercial instrument, not part of what is being built, and the engine
   * decides what it is worth server-side whatever this string says.
   */
  const [discountCode, setDiscountCode] = useState("");
  const [assessing, startAssessing] = useTransition();

  const issue = validateStep(step, draft);
  const index = stepIndex(step);
  const isLast = index === STEP_IDS.length - 1;

  const runAssessment = useCallback((source: ConfiguratorDraft, code = "") => {
    setAssessFailed(false);
    startAssessing(async () => {
      const result = await assessDraft(source, code.trim() || null);
      if (result.ok) setAssessment(result.assessment);
      else {
        setAssessment(null);
        setAssessFailed(true);
      }
    });
  }, []);

  const goTo = useCallback(
    (next: StepId) => {
      setStep(next);
      setAttempted(false);
      // Re-price on every entry into the derived steps: the customer may have
      // gone back and changed an answer, and a stale figure here would be the
      // worst possible thing to get wrong.
      if (DERIVED_STEPS.includes(next)) runAssessment(draft, discountCode);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [draft, discountCode, runAssessment],
  );

  const goNext = useCallback(() => {
    if (issue) {
      // Validation appears only once Next has been pressed; showing it while a
      // field is still being filled in reads as nagging.
      setAttempted(true);
      return;
    }
    const next = STEP_IDS[index + 1];
    if (next) goTo(next);
  }, [issue, index, goTo]);

  const goBack = useCallback(() => {
    const previous = STEP_IDS[index - 1];
    if (previous) goTo(previous);
  }, [index, goTo]);

  const resumeTarget = firstUnsatisfiedStep(draft) ?? "scope";

  const stepperSteps = STEP_IDS.map((id) => ({ id, label: t(`steps.${id}.label`) }));

  return (
    <div className="flex flex-col gap-10">
      <Stepper
        steps={stepperSteps}
        current={index}
        label={t("progressLabel")}
        statusLabel={(status) => t(`status.${status}`)}
      />

      {resumedFrom ? (
        <Callout
          tone="info"
          title={t("resume.title")}
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  acknowledgeResume();
                  goTo(resumeTarget);
                }}
              >
                {t("resume.continue")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                startIcon={<RotateCcw className="size-4" />}
                onClick={() => {
                  resetDraft(locale);
                  setAssessment(null);
                  goTo("type");
                }}
              >
                {t("resume.startOver")}
              </Button>
            </div>
          }
        >
          {t("resume.body", {
            when: new Intl.DateTimeFormat(locale, {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(resumedFrom),
          })}
        </Callout>
      ) : null}

      <div className="flex flex-col gap-3">
        <h1 className="text-display-lg text-primary">{t(`steps.${step}.title`)}</h1>
        <p className="max-w-2xl text-body-lg text-secondary">{t(`steps.${step}.lede`)}</p>
      </div>

      <div className="min-h-[18rem]">
        {step === "type" ? <StepType draft={draft} onChange={updateDraft} /> : null}
        {step === "intake" ? <StepIntake draft={draft} onChange={updateDraft} /> : null}
        {step === "design" ? <StepDesign draft={draft} onChange={updateDraft} /> : null}
        {step === "features" ? (
          <StepFeatures draft={draft} onChange={updateDraft} />
        ) : null}
        {step === "platform" ? (
          <StepPlatform draft={draft} onChange={updateDraft} />
        ) : null}
        {step === "scope" ? (
          <StepScopeResult
            assessment={assessment}
            pending={assessing}
            failed={assessFailed}
            onRetry={() => runAssessment(draft, discountCode)}
          />
        ) : null}
        {step === "review" ? (
          <StepReview
            draft={draft}
            assessment={assessment}
            onEdit={goTo}
            discountCode={discountCode}
            onDiscountCodeChange={setDiscountCode}
            onApplyDiscount={() => runAssessment(draft, discountCode)}
            applying={assessing}
          />
        ) : null}
        {step === "start" ? (
          <StepStart assessment={assessment} draft={draft} discountCode={discountCode} />
        ) : null}
      </div>

      {attempted && issue ? (
        <Callout tone="warning" live title={t(`issues.${issue}`)} />
      ) : null}

      <div className="flex flex-col gap-4 border-t border-line-subtle pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={goBack}
            disabled={index === 0}
            startIcon={<ArrowLeft className="rtl-flip size-4" />}
          >
            {t("back")}
          </Button>

          {!isLast ? (
            // Not disabled when invalid: a disabled Next gives no reason.
            // Pressing it explains what is missing instead.
            <Button onClick={goNext} endIcon={<ArrowRight className="rtl-flip size-4" />}>
              {t("next")}
            </Button>
          ) : null}
        </div>

        <SaveIndicator state={saveState} label={t(`save.${saveState}`)} />
      </div>
    </div>
  );
}

function SaveIndicator({ state, label }: { state: string; label: string }) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 text-caption text-tertiary",
        "duration-base transition-opacity",
        state === "idle" && "opacity-0",
      )}
      // Autosave is reassurance, not news; announcing every save would be noise.
      aria-live="off"
    >
      {state === "saved" ? <Check className="size-3.5 text-success" aria-hidden /> : null}
      {label}
    </p>
  );
}
