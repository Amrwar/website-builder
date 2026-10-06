"use client";

import { useState, useTransition } from "react";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { SCOPE_TIERS, type ScopeTierId } from "@/db/schema/enums";
import { BUILD_TYPES, type BuildType } from "@/config/products";
import {
  addDiscount,
  importCatalogDefaults,
  saveCurrency,
  saveFeature,
  saveTier,
  toggleDiscount,
} from "@/server/admin-actions";

/**
 * Editing the commercial catalogue.
 *
 * Every control here is a convenience over a server action that re-checks
 * `settings:manage` and validates the figures itself. A read-only viewer sees
 * the same numbers with no controls, but hiding the buttons is presentation --
 * the refusal comes from the server either way.
 *
 * Each form asks for a reason. It is optional, and it goes into the audit entry
 * beside the before and after values, because "who changed the price of a
 * website build in March" is a question a business will eventually ask.
 */

type ActionResult = { ok: boolean; message?: string };

/** Shared save plumbing: one pending state, one error, one success toast. */
function useSaver(label: string) {
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(action: () => Promise<ActionResult>, onDone?: () => void) {
    setError(null);
    start(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message ?? null);
        return;
      }
      toast({ title: label, tone: "success" });
      onDone?.();
    });
  }

  return { error, pending, run, setError };
}

/** A number input that keeps an empty field distinguishable from a zero. */
function NumberField({
  label,
  value,
  onChange,
  min = 0,
  step = 1,
  disabled,
  description,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  min?: number;
  step?: number;
  disabled?: boolean;
  description?: string;
}) {
  return (
    <Field label={label} description={description}>
      <Input
        type="number"
        inputMode="decimal"
        min={min}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function ReasonField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const t = useTranslations("adminConsole.pricing");
  return (
    <Field label={t("reason")}>
      <Input
        value={value}
        maxLength={200}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

/* -------------------------------------------------------------------------
 * Importing the shipped defaults
 * ---------------------------------------------------------------------- */

export function ImportDefaults() {
  const t = useTranslations("adminConsole.pricing.usingDefaults");
  const { error, pending, run } = useSaver(t("title"));

  return (
    <Callout tone="info" title={t("title")}>
      <p>{t("body")}</p>
      {error ? <p className="mt-2 text-caption text-danger">{error}</p> : null}
      <Button
        size="sm"
        variant="secondary"
        className="mt-3"
        disabled={pending}
        onClick={() => run(() => importCatalogDefaults())}
      >
        {t("action")}
      </Button>
    </Callout>
  );
}

/* -------------------------------------------------------------------------
 * Tiers
 * ---------------------------------------------------------------------- */

export interface TierRow {
  id: string;
  buildType: BuildType;
  tier: ScopeTierId;
  priceMinorUnits: number | null;
  guaranteedDays: number | null;
  pointThreshold: number;
  isActive: boolean;
}

export function TierEditor({ row, canEdit }: { row: TierRow; canEdit: boolean }) {
  const t = useTranslations("adminConsole.pricing");
  const { error, pending, run } = useSaver(t("saved"));
  const [open, setOpen] = useState(false);

  const [price, setPrice] = useState(
    row.priceMinorUnits === null ? "" : String(row.priceMinorUnits / 100),
  );
  const [days, setDays] = useState(
    row.guaranteedDays === null ? "" : String(row.guaranteedDays),
  );
  const [threshold, setThreshold] = useState(String(row.pointThreshold));
  const [active, setActive] = useState(row.isActive);
  const [reason, setReason] = useState("");

  function submit() {
    run(
      () =>
        saveTier(
          row.id,
          {
            // Entered in major units because that is how a price list is read.
            // Converted here, and the server validates the integer it receives.
            priceMinorUnits: price.trim() === "" ? null : Math.round(Number(price) * 100),
            guaranteedDays: days.trim() === "" ? null : Number(days),
            pointThreshold: Number(threshold),
            isActive: active,
          },
          reason.trim() || undefined,
        ),
      () => setOpen(false),
    );
  }

  if (!canEdit) {
    return (
      <Badge tone={row.isActive ? "success" : "neutral"}>
        {row.isActive ? t("active") : t("inactive")}
      </Badge>
    );
  }

  if (!open) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="self-start"
        onClick={() => setOpen(true)}
      >
        {t("edit")}
      </Button>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      {error ? <Callout tone="danger" live title={error} /> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <NumberField
          label={t("price")}
          value={price}
          onChange={setPrice}
          step={1}
          description={t("quote")}
        />
        <NumberField label={t("days")} value={days} onChange={setDays} min={1} />
        <NumberField label={t("threshold")} value={threshold} onChange={setThreshold} />
      </div>

      <Checkbox
        label={t("active")}
        checked={active}
        onChange={(event) => setActive(event.target.checked)}
      />

      <ReasonField value={reason} onChange={setReason} />

      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={submit}>
          {t("save")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Features
 * ---------------------------------------------------------------------- */

export interface FeatureRow {
  id: string;
  key: string;
  points: number;
  minimumTier: ScopeTierId;
  surchargeMinorUnits: number | null;
  isActive: boolean;
}

export function FeatureEditor({ row, canEdit }: { row: FeatureRow; canEdit: boolean }) {
  const t = useTranslations("adminConsole.pricing");
  const { error, pending, run } = useSaver(t("saved"));
  const [open, setOpen] = useState(false);

  const [points, setPoints] = useState(String(row.points));
  const [tier, setTier] = useState<ScopeTierId>(row.minimumTier);
  const [surcharge, setSurcharge] = useState(
    row.surchargeMinorUnits === null ? "" : String(row.surchargeMinorUnits / 100),
  );
  const [active, setActive] = useState(row.isActive);
  const [reason, setReason] = useState("");

  function submit() {
    run(
      () =>
        saveFeature(
          row.id,
          {
            points: Number(points),
            minimumTier: tier,
            surchargeMinorUnits:
              surcharge.trim() === "" ? null : Math.round(Number(surcharge) * 100),
            isActive: active,
          },
          reason.trim() || undefined,
        ),
      () => setOpen(false),
    );
  }

  if (!canEdit) return null;

  if (!open) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="self-start"
        onClick={() => setOpen(true)}
      >
        {t("edit")}
      </Button>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      {error ? <Callout tone="danger" live title={error} /> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <NumberField label={t("points")} value={points} onChange={setPoints} />

        <Field label={t("minimumTier")}>
          <select
            value={tier}
            onChange={(event) => setTier(event.target.value as ScopeTierId)}
            className="h-10 w-full rounded-md border border-line-strong bg-canvas px-3 text-body-sm text-primary"
          >
            {SCOPE_TIERS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>

        <NumberField
          label={t("surcharge")}
          value={surcharge}
          onChange={setSurcharge}
          description={t("noSurcharge")}
        />
      </div>

      <Checkbox
        label={t("active")}
        checked={active}
        onChange={(event) => setActive(event.target.checked)}
      />

      <ReasonField value={reason} onChange={setReason} />

      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={submit}>
          {t("save")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Currencies
 * ---------------------------------------------------------------------- */

export interface CurrencyRow {
  id: string;
  code: string;
  rate: string;
  roundToMinorUnits: number;
  reviewedOn: string | null;
  isActive: boolean;
}

export function CurrencyEditor({
  row,
  canEdit,
  isBase,
}: {
  row: CurrencyRow;
  canEdit: boolean;
  isBase: boolean;
}) {
  const t = useTranslations("adminConsole.pricing");
  const { error, pending, run } = useSaver(t("saved"));
  const [open, setOpen] = useState(false);

  const [rate, setRate] = useState(row.rate);
  const [rounding, setRounding] = useState(String(row.roundToMinorUnits));
  const [reviewedOn, setReviewedOn] = useState(row.reviewedOn ?? "");
  const [active, setActive] = useState(row.isActive);
  const [reason, setReason] = useState("");

  function submit() {
    run(
      () =>
        saveCurrency(
          row.id,
          {
            rate: Number(rate),
            roundToMinorUnits: Number(rounding),
            reviewedOn,
            isActive: active,
          },
          reason.trim() || undefined,
        ),
      () => setOpen(false),
    );
  }

  if (!canEdit) return null;

  // The base currency is never converted, so there is no rate to edit and no
  // sense in withdrawing it. Stated rather than silently disabled.
  if (isBase) {
    return <span className="text-caption text-tertiary">{t("baseCurrency")}</span>;
  }

  if (!open) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="self-start"
        onClick={() => setOpen(true)}
      >
        {t("edit")}
      </Button>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      {error ? <Callout tone="danger" live title={error} /> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <NumberField label={t("rate")} value={rate} onChange={setRate} step={0.01} />
        <NumberField
          label={t("rounding")}
          value={rounding}
          onChange={setRounding}
          min={1}
        />
        <Field label={t("reviewedOn")}>
          <Input
            type="date"
            value={reviewedOn}
            onChange={(event) => setReviewedOn(event.target.value)}
          />
        </Field>
      </div>

      <Checkbox
        label={t("active")}
        checked={active}
        onChange={(event) => setActive(event.target.checked)}
      />

      <ReasonField value={reason} onChange={setReason} />

      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={submit}>
          {t("save")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Discounts
 * ---------------------------------------------------------------------- */

export function DiscountToggle({
  id,
  code,
  isActive,
  canEdit,
}: {
  id: string;
  code: string;
  isActive: boolean;
  canEdit: boolean;
}) {
  const t = useTranslations("adminConsole.pricing");
  const { error, pending, run } = useSaver(code);

  if (!canEdit) {
    return (
      <Badge tone={isActive ? "success" : "neutral"}>
        {isActive ? t("active") : t("inactive")}
      </Badge>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {error ? <span className="text-caption text-danger">{error}</span> : null}
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => run(() => toggleDiscount(id, !isActive))}
      >
        {isActive ? t("withdraw") : t("reinstate")}
      </Button>
    </div>
  );
}

export function NewDiscount() {
  const t = useTranslations("adminConsole.pricing");
  const { error, pending, run } = useSaver(t("saved"));
  const [open, setOpen] = useState(false);

  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"percentage" | "fixed">("percentage");
  const [value, setValue] = useState("10");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [buildTypes, setBuildTypes] = useState<BuildType[]>([]);

  function submit() {
    run(
      () =>
        addDiscount({
          code,
          description: description.trim() || null,
          kind,
          // A percentage is a whole percent; a fixed amount is entered in
          // major units and stored in minor, like every other price here.
          value: kind === "percentage" ? Number(value) : Math.round(Number(value) * 100),
          maxDiscountMinorUnits:
            maxDiscount.trim() === "" ? null : Math.round(Number(maxDiscount) * 100),
          minOrderMinorUnits:
            minOrder.trim() === "" ? null : Math.round(Number(minOrder) * 100),
          appliesToBuildTypes: buildTypes,
          startsAt: null,
          endsAt: endsAt.trim() === "" ? null : new Date(`${endsAt}T23:59:59Z`),
          maxRedemptions: maxRedemptions.trim() === "" ? null : Number(maxRedemptions),
          isActive: true,
        }),
      () => {
        setOpen(false);
        setCode("");
        setDescription("");
      },
    );
  }

  if (!open) {
    return (
      <Button
        size="sm"
        variant="secondary"
        className="self-start"
        onClick={() => setOpen(true)}
      >
        {t("newDiscount")}
      </Button>
    );
  }

  return (
    <Card padding="lg" className="flex flex-col gap-4">
      {error ? <Callout tone="danger" live title={error} /> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("code")}>
          <Input
            value={code}
            maxLength={32}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
        </Field>

        <Field label={t("description")}>
          <Input
            value={description}
            maxLength={200}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        <Field label={t("kind")}>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as "percentage" | "fixed")}
            className="h-10 w-full rounded-md border border-line-strong bg-canvas px-3 text-body-sm text-primary"
          >
            <option value="percentage">{t("percentage")}</option>
            <option value="fixed">{t("fixed")}</option>
          </select>
        </Field>

        <NumberField label={t("value")} value={value} onChange={setValue} min={1} />

        <NumberField
          label={t("maxDiscount")}
          value={maxDiscount}
          onChange={setMaxDiscount}
        />
        <NumberField label={t("minOrder")} value={minOrder} onChange={setMinOrder} />

        <NumberField
          label={t("redemptions")}
          value={maxRedemptions}
          onChange={setMaxRedemptions}
          min={1}
          description={t("unlimited")}
        />

        <Field label={t("window")}>
          <Input
            type="date"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
          />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-caption text-secondary">{t("appliesTo")}</legend>
        <p className="text-caption text-tertiary">{t("allBuilds")}</p>
        <div className="flex flex-wrap gap-4">
          {BUILD_TYPES.map((type) => (
            <Checkbox
              key={type}
              label={type}
              checked={buildTypes.includes(type)}
              onChange={(event) =>
                setBuildTypes((current) =>
                  event.target.checked
                    ? [...current, type]
                    : current.filter((entry) => entry !== type),
                )
              }
            />
          ))}
        </div>
      </fieldset>

      <div className="flex gap-2">
        <Button size="sm" disabled={pending || code.trim().length < 3} onClick={submit}>
          {t("create")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </Card>
  );
}
