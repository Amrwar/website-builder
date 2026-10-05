"use client";

import { useTranslations } from "next-intl";

import { Field } from "@/components/ui/field";
import { CharacterCount, Input, Textarea } from "@/components/ui/input";
import {
  MAX_DESCRIPTION,
  MAX_SHORT_TEXT,
  MIN_DESCRIPTION,
  type ConfiguratorDraft,
} from "@/lib/configurator/draft";

type Update = (recipe: (draft: ConfiguratorDraft) => ConfiguratorDraft) => void;

/**
 * Step 2 — tell us about it.
 *
 * The description is the single most valuable input: the scope engine reads it
 * and reports which rules it matched. The surrounding fields are not filler --
 * industry, customers and outcome are scanned for the same signals, which is
 * why "our drivers" in the customers field counts as evidence.
 *
 * Only the description and business name are required. Making every field
 * mandatory would push people into writing filler, which degrades the very
 * input the assessment depends on.
 */
export function StepIntake({
  draft,
  onChange,
}: {
  draft: ConfiguratorDraft;
  onChange: Update;
}) {
  const t = useTranslations("configurator.intake");

  function setField(key: keyof ConfiguratorDraft["intake"], value: string) {
    onChange((current) => ({
      ...current,
      intake: { ...current.intake, [key]: value },
    }));
  }

  const tooShort =
    draft.intake.description.length > 0 &&
    draft.intake.description.trim().length < MIN_DESCRIPTION;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          label={t("businessName.label")}
          description={t("businessName.help")}
          required
        >
          <Input
            value={draft.intake.businessName}
            maxLength={MAX_SHORT_TEXT}
            autoComplete="organization"
            onChange={(event) => setField("businessName", event.target.value)}
          />
        </Field>

        <Field label={t("industry.label")} description={t("industry.help")}>
          <Input
            value={draft.intake.industry}
            maxLength={MAX_SHORT_TEXT}
            onChange={(event) => setField("industry", event.target.value)}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <Field
          label={t("description.label")}
          description={t("description.help")}
          required
          error={
            tooShort ? t("description.tooShort", { min: MIN_DESCRIPTION }) : undefined
          }
        >
          <Textarea
            value={draft.intake.description}
            rows={7}
            maxLength={MAX_DESCRIPTION}
            placeholder={t("description.placeholder")}
            onChange={(event) => setField("description", event.target.value)}
          />
        </Field>
        <CharacterCount
          value={draft.intake.description}
          max={MAX_DESCRIPTION}
          label={(remaining) => t("description.remaining", { remaining })}
        />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label={t("targetCustomers.label")} description={t("targetCustomers.help")}>
          <Input
            value={draft.intake.targetCustomers}
            maxLength={MAX_SHORT_TEXT}
            placeholder={t("targetCustomers.placeholder")}
            onChange={(event) => setField("targetCustomers", event.target.value)}
          />
        </Field>

        <Field label={t("desiredOutcome.label")} description={t("desiredOutcome.help")}>
          <Input
            value={draft.intake.desiredOutcome}
            maxLength={MAX_SHORT_TEXT}
            placeholder={t("desiredOutcome.placeholder")}
            onChange={(event) => setField("desiredOutcome", event.target.value)}
          />
        </Field>
      </div>
    </div>
  );
}
