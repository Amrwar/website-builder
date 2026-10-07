"use client";

import { useState, useTransition } from "react";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import type {
  BusinessFeatureId,
  FeatureKind,
  RecommendationLevel,
} from "@/config/business";
import { LOCALES, type Locale } from "@/config/locales";
import { BUILD_TYPES, type BuildType } from "@/config/products";
import { useRouter } from "@/i18n/navigation";
import {
  MAX_BLUEPRINT_NAME,
  MAX_BLUEPRINT_SUMMARY,
  type BlueprintCopySet,
  type BlueprintDefinition,
} from "@/lib/business/blueprint";
import {
  createBlueprintAction,
  publishBlueprintAction,
  saveBlueprintAction,
  saveBlueprintCategoryAction,
  setBlueprintStatusAction,
} from "@/server/admin-actions";

/**
 * Administering Business-in-a-Box.
 *
 * Controls only. Each one calls a server action whose service re-checks
 * `settings:manage` and validates the definition; a viewer without it is
 * never shown these, and would be refused by the server if they sent one
 * anyway. Names arrive as props, already translated, because half of them
 * come from the database.
 */

type Option = { value: string; label: string };

function useRun() {
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run<T extends { ok: boolean; message?: string }>(
    action: () => Promise<T>,
    onDone: (result: T) => void,
  ) {
    setError(null);
    start(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message ?? null);
        return;
      }
      onDone(result);
    });
  }

  return { error, pending, run, toast };
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-caption text-danger">
      {error}
    </p>
  ) : null;
}

function OptionSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly Option[];
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function emptyCopy(): BlueprintCopySet {
  return Object.fromEntries(
    LOCALES.map((locale) => [locale, { name: "", summary: "" }]),
  ) as BlueprintCopySet;
}

function CopyFields({
  copy,
  onChange,
}: {
  copy: BlueprintCopySet;
  onChange: (next: BlueprintCopySet) => void;
}) {
  const t = useTranslations("adminConsole.blueprintsPage.editor");
  const tLanguage = useTranslations("languages");

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {LOCALES.map((locale) => (
        <div key={locale} className="flex flex-col gap-3" lang={locale}>
          <Field label={t("name", { language: tLanguage(locale) })} required>
            <Input
              value={copy[locale].name}
              maxLength={MAX_BLUEPRINT_NAME}
              dir="auto"
              onChange={(event) =>
                onChange({
                  ...copy,
                  [locale]: { ...copy[locale], name: event.target.value },
                })
              }
            />
          </Field>
          <Field label={t("summary", { language: tLanguage(locale) })} required>
            <Textarea
              rows={3}
              value={copy[locale].summary}
              maxLength={MAX_BLUEPRINT_SUMMARY}
              dir="auto"
              onChange={(event) =>
                onChange({
                  ...copy,
                  [locale]: { ...copy[locale], summary: event.target.value },
                })
              }
            />
          </Field>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * New blueprint
 * ---------------------------------------------------------------------- */

export function CreateBlueprint({
  categories,
  products,
}: {
  categories: readonly Option[];
  products: readonly Option[];
}) {
  const t = useTranslations("adminConsole.blueprintsPage.create");
  const router = useRouter();
  const { error, pending, run } = useRun();

  const [key, setKey] = useState("");
  const [categoryKey, setCategoryKey] = useState(categories[0]?.value ?? "");
  const [buildType, setBuildType] = useState<BuildType>("website");
  const [copy, setCopy] = useState<BlueprintCopySet>(emptyCopy);

  return (
    <Card padding="lg" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-display-xs text-primary">{t("title")}</h2>
        <p className="text-body-sm text-secondary">{t("body")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("key")} description={t("keyHelp")} required>
          <Input
            value={key}
            maxLength={48}
            dir="ltr"
            spellCheck={false}
            onChange={(event) => setKey(event.target.value.trim().toLowerCase())}
          />
        </Field>
        <OptionSelect
          label={t("category")}
          value={categoryKey}
          options={categories}
          onChange={setCategoryKey}
        />
        <OptionSelect
          label={t("product")}
          value={buildType}
          options={products}
          onChange={(value) => setBuildType(value as BuildType)}
        />
      </div>
      <CopyFields copy={copy} onChange={setCopy} />
      <ErrorLine error={error} />
      <div>
        <Button
          loading={pending}
          onClick={() =>
            run(
              () =>
                createBlueprintAction(key, {
                  definition: {
                    categoryKey,
                    buildType,
                    recommended: ["home", "contact"],
                    optional: [],
                    copy,
                  } satisfies BlueprintDefinition,
                }),
              () => router.push(`/admin/blueprints/${key}`),
            )
          }
        >
          {t("submit")}
        </Button>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------
 * Categories
 * ---------------------------------------------------------------------- */

export function CategoryControls({
  categoryKey,
  sortOrder,
  isActive,
}: {
  categoryKey: string;
  sortOrder: number;
  isActive: boolean;
}) {
  const t = useTranslations("adminConsole.blueprintsPage.categories");
  const { error, pending, run, toast } = useRun();
  const [order, setOrder] = useState(String(sortOrder));
  const [shown, setShown] = useState(isActive);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-24">
        <Field label={t("order")}>
          <Input
            type="number"
            min={0}
            value={order}
            onChange={(event) => setOrder(event.target.value)}
          />
        </Field>
      </div>
      <Checkbox
        label={t("shown")}
        checked={shown}
        onChange={(event) => setShown(event.target.checked)}
      />
      <Button
        size="sm"
        variant="secondary"
        loading={pending}
        onClick={() =>
          run(
            () =>
              saveBlueprintCategoryAction({
                key: categoryKey,
                sortOrder: Number(order),
                isActive: shown,
              }),
            () => toast({ title: t("save"), tone: "success" }),
          )
        }
      >
        {t("save")}
      </Button>
      <ErrorLine error={error} />
    </div>
  );
}

export function CreateCategory() {
  const t = useTranslations("adminConsole.blueprintsPage.categories");
  const tCreate = useTranslations("adminConsole.blueprintsPage.create");
  const tLanguage = useTranslations("languages");
  const router = useRouter();
  const { error, pending, run } = useRun();
  const [key, setKey] = useState("");
  const [names, setNames] = useState<Record<Locale, string>>(
    () =>
      Object.fromEntries(LOCALES.map((locale) => [locale, ""])) as Record<Locale, string>,
  );

  return (
    <Card padding="lg" className="flex flex-col gap-4">
      <h3 className="text-body font-medium text-primary">{t("createTitle")}</h3>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label={t("key")} description={tCreate("keyHelp")} required>
          <Input
            value={key}
            maxLength={48}
            dir="ltr"
            spellCheck={false}
            onChange={(event) => setKey(event.target.value.trim().toLowerCase())}
          />
        </Field>
        {LOCALES.map((locale) => (
          <Field
            key={locale}
            label={t("nameIn", { language: tLanguage(locale) })}
            required
          >
            <Input
              value={names[locale]}
              maxLength={60}
              dir="auto"
              lang={locale}
              onChange={(event) => setNames({ ...names, [locale]: event.target.value })}
            />
          </Field>
        ))}
      </div>
      <ErrorLine error={error} />
      <div>
        <Button
          variant="secondary"
          loading={pending}
          onClick={() =>
            run(
              () => saveBlueprintCategoryAction({ key, names }),
              () => {
                setKey("");
                router.refresh();
              },
            )
          }
        >
          {t("create")}
        </Button>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------
 * The editor
 * ---------------------------------------------------------------------- */

export interface EditorFeature {
  id: BusinessFeatureId;
  kind: FeatureKind;
  name: string;
}

const LEVELS: readonly RecommendationLevel[] = ["recommended", "optional", "not_needed"];

export function BlueprintEditor({
  blueprintKey,
  working,
  isShipped,
  catalogueCopy,
  categories,
  products,
  features,
  kindLabels,
}: {
  blueprintKey: string;
  working: BlueprintDefinition;
  isShipped: boolean;
  /** The catalogue wording, for a shipped blueprint: the starting point for an override. */
  catalogueCopy: BlueprintCopySet | null;
  categories: readonly Option[];
  products: readonly Option[];
  features: readonly EditorFeature[];
  kindLabels: Record<FeatureKind, string>;
}) {
  const t = useTranslations("adminConsole.blueprintsPage.editor");
  const { error, pending, run, toast } = useRun();
  const router = useRouter();

  const [categoryKey, setCategoryKey] = useState(working.categoryKey);
  const [buildType, setBuildType] = useState<BuildType>(working.buildType);
  const [levels, setLevels] = useState<Record<string, RecommendationLevel>>(() =>
    Object.fromEntries(
      features.map((feature) => [
        feature.id,
        working.recommended.includes(feature.id)
          ? "recommended"
          : working.optional.includes(feature.id)
            ? "optional"
            : "not_needed",
      ]),
    ),
  );
  const [useCatalogue, setUseCatalogue] = useState(isShipped && working.copy === null);
  const [copy, setCopy] = useState<BlueprintCopySet>(
    () => working.copy ?? catalogueCopy ?? emptyCopy(),
  );
  const [note, setNote] = useState("");

  function definition(): BlueprintDefinition {
    const pick = (level: RecommendationLevel) =>
      features.filter((feature) => levels[feature.id] === level).map((f) => f.id);
    return {
      categoryKey,
      buildType: BUILD_TYPES.includes(buildType) ? buildType : "website",
      recommended: pick("recommended"),
      optional: pick("optional"),
      copy: useCatalogue ? null : copy,
    };
  }

  function save(publish: boolean) {
    run(
      () =>
        saveBlueprintAction(blueprintKey, { definition: definition(), note, publish }),
      (result) => {
        if (!result.ok) return;
        const version = "version" in result ? result.version : 0;
        toast({
          title: publish ? t("published", { version }) : t("saved", { version }),
          tone: "success",
        });
        setNote("");
        router.refresh();
      },
    );
  }

  const kinds: FeatureKind[] = ["page", "feature", "workflow"];

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <OptionSelect
          label={t("category")}
          value={categoryKey}
          options={categories}
          onChange={setCategoryKey}
        />
        <OptionSelect
          label={t("product")}
          value={buildType}
          options={products}
          onChange={(value) => setBuildType(value as BuildType)}
        />
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-display-xs text-primary">{t("features")}</h2>
          <p className="text-body-sm text-secondary">{t("featuresHelp")}</p>
        </div>
        {kinds.map((kind) => (
          <div key={kind} className="flex flex-col gap-2">
            <h3 className="text-eyebrow text-tertiary uppercase">{kindLabels[kind]}</h3>
            <ul className="flex flex-col divide-y divide-line-subtle rounded-lg border border-line">
              {features
                .filter((feature) => feature.kind === kind)
                .map((feature) => (
                  <li key={feature.id}>
                    <fieldset className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <legend className="sr-only">{feature.name}</legend>
                      <span aria-hidden className="text-body-sm text-primary">
                        {feature.name}
                        <span className="ms-2 font-mono text-caption text-tertiary">
                          {feature.id}
                        </span>
                      </span>
                      <span className="flex flex-wrap gap-3">
                        {LEVELS.map((level) => (
                          <label
                            key={level}
                            className="flex cursor-pointer items-center gap-1.5 text-body-sm text-secondary"
                          >
                            <input
                              type="radio"
                              name={`level-${feature.id}`}
                              value={level}
                              checked={levels[feature.id] === level}
                              onChange={() =>
                                setLevels({ ...levels, [feature.id]: level })
                              }
                              className="size-4 accent-accent"
                            />
                            {t(`levels.${level}`)}
                          </label>
                        ))}
                      </span>
                    </fieldset>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-display-xs text-primary">{t("copy")}</h2>
        {isShipped ? (
          <Checkbox
            label={t("useCatalogue")}
            checked={useCatalogue}
            onChange={(event) => setUseCatalogue(event.target.checked)}
          />
        ) : (
          <p className="text-body-sm text-secondary">{t("copyRequired")}</p>
        )}
        {!useCatalogue ? <CopyFields copy={copy} onChange={setCopy} /> : null}
      </section>

      <Field label={t("note")} description={t("noteHelp")}>
        <Input
          value={note}
          maxLength={500}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>

      <ErrorLine error={error} />
      <div className="flex flex-wrap gap-3">
        <Button loading={pending} onClick={() => save(true)}>
          {t("saveAndPublish")}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => save(false)}>
          {t("save")}
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Version and status controls
 * ---------------------------------------------------------------------- */

export function PublishVersion({
  blueprintKey,
  version,
}: {
  blueprintKey: string;
  version: number;
}) {
  const t = useTranslations("adminConsole.blueprintsPage");
  const router = useRouter();
  const { error, pending, run, toast } = useRun();
  return (
    <span className="flex flex-col gap-1">
      <Button
        size="sm"
        variant="secondary"
        loading={pending}
        onClick={() =>
          run(
            () => publishBlueprintAction(blueprintKey, version),
            () => {
              toast({ title: t("editor.published", { version }), tone: "success" });
              router.refresh();
            },
          )
        }
      >
        {t("versions.publish")}
      </Button>
      <ErrorLine error={error} />
    </span>
  );
}

export function BlueprintStatusToggle({
  blueprintKey,
  status,
}: {
  blueprintKey: string;
  status: "active" | "archived";
}) {
  const t = useTranslations("adminConsole.blueprintsPage.editor");
  const router = useRouter();
  const { error, pending, run } = useRun();
  const next = status === "active" ? "archived" : "active";
  return (
    <span className="flex flex-col gap-1">
      <Button
        size="sm"
        variant={status === "active" ? "ghost" : "secondary"}
        loading={pending}
        onClick={() =>
          run(
            () => setBlueprintStatusAction(blueprintKey, next),
            () => router.refresh(),
          )
        }
      >
        {status === "active" ? t("archive") : t("restore")}
      </Button>
      <ErrorLine error={error} />
    </span>
  );
}

export function NotPublishedCallout() {
  const t = useTranslations("adminConsole.blueprintsPage.editor");
  return <Callout tone="warning" title={t("notLive")} />;
}
