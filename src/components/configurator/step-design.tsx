"use client";

import { Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { ChoiceCard } from "@/components/ui/choice-card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { DESIGN_SERVICE } from "@/config/design";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { DESIGN_APPROACHES } from "@/db/schema/enums";
import {
  MAX_DESCRIPTION,
  MAX_LINKS,
  MAX_SHORT_TEXT,
  type ConfiguratorDraft,
} from "@/lib/configurator/draft";
import { formatMoney } from "@/lib/pricing/money";

type Update = (recipe: (draft: ConfiguratorDraft) => ConfiguratorDraft) => void;

/**
 * Step 3 — design.
 *
 * The fee for "design it for me" is shown on the option itself, before it is
 * chosen, and again on the review screen. A charge a customer only discovers
 * at checkout is the kind of surprise this whole product exists to avoid.
 *
 * Binary assets (logos, screenshots, PDFs) are deliberately not uploaded here.
 * They attach to a project after the account exists, which is also when the
 * guarantee's "assets submitted" rule starts to matter -- and an unauthenticated
 * public upload endpoint would be an abuse vector while rate limiting is still
 * outstanding. What this step collects is direction: links, colours, notes.
 */
export function StepDesign({
  draft,
  onChange,
}: {
  draft: ConfiguratorDraft;
  onChange: Update;
}) {
  const t = useTranslations("configurator.design");
  const { intlTag } = getLocaleDefinition(resolveLocale(useLocale()));
  const fee = formatMoney(DESIGN_SERVICE.fee, intlTag, { trimWholeDecimals: true });

  function setDesign(patch: Partial<ConfiguratorDraft["design"]>) {
    onChange((current) => ({ ...current, design: { ...current.design, ...patch } }));
  }

  function setLink(index: number, value: string) {
    const links = [...draft.design.referenceLinks];
    links[index] = value;
    setDesign({ referenceLinks: links });
  }

  const links = draft.design.referenceLinks;
  const needsDirection =
    draft.design.approach && draft.design.approach !== "design_for_me";

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-3 lg:grid-cols-3">
        {DESIGN_APPROACHES.map((approach) => (
          <ChoiceCard
            key={approach}
            name="design-approach"
            value={approach}
            checked={draft.design.approach === approach}
            onChange={() => setDesign({ approach })}
            title={t(`${approach}.title`)}
            description={t(`${approach}.body`)}
            meta={
              <span className="text-body-sm whitespace-nowrap text-primary">
                {approach === "design_for_me" ? `+${fee}` : t("included")}
              </span>
            }
          />
        ))}
      </div>

      {draft.design.approach === "design_for_me" ? (
        <Callout tone="info" title={t("service.title", { fee })}>
          {t("service.body")}
        </Callout>
      ) : null}

      {needsDirection ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <Field
              label={t("links.label")}
              description={t("links.help")}
              hideLabel={false}
            >
              <div className="flex flex-col gap-2">
                {(links.length > 0 ? links : [""]).map((link, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={link}
                      type="url"
                      inputMode="url"
                      placeholder={t("links.placeholder")}
                      onChange={(event) => setLink(index, event.target.value)}
                    />
                    {links.length > 1 ? (
                      <Button
                        variant="ghost"
                        aria-label={t("links.remove")}
                        onClick={() =>
                          setDesign({
                            referenceLinks: links.filter((_, i) => i !== index),
                          })
                        }
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </Field>

            {links.length < MAX_LINKS ? (
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                startIcon={<Plus className="size-4" />}
                onClick={() => setDesign({ referenceLinks: [...links, ""] })}
              >
                {t("links.add")}
              </Button>
            ) : null}
          </div>

          <Field label={t("colours.label")} description={t("colours.help")}>
            <Input
              value={draft.design.colourNotes}
              maxLength={MAX_SHORT_TEXT}
              placeholder={t("colours.placeholder")}
              onChange={(event) => setDesign({ colourNotes: event.target.value })}
            />
          </Field>

          <Field label={t("notes.label")} description={t("notes.help")}>
            <Textarea
              value={draft.design.brandNotes}
              rows={4}
              maxLength={MAX_DESCRIPTION}
              onChange={(event) => setDesign({ brandNotes: event.target.value })}
            />
          </Field>

          <p className="text-caption text-tertiary">{t("filesLater")}</p>
        </div>
      ) : null}
    </div>
  );
}
