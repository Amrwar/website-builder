"use client";

import { useState, useTransition } from "react";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  decideCommission,
  decidePartner,
  moderateReview,
  reverseReferralReward,
  saveShowcaseEntry,
  setShowcasePublished,
} from "@/server/growth-actions";

/**
 * The growth console's controls.
 *
 * Every one is a convenience over a server action that re-checks permission
 * and re-derives the decision. A hidden button is presentation; the refusal
 * lives in the service.
 *
 * Each destructive or money-moving action asks for a reason before it will
 * run, because the audit entry it writes is worthless without one and because
 * these are decisions somebody has to own six months later.
 */

type Result = { ok: boolean; message?: string };

function useAction(successLabel: string) {
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(action: () => Promise<Result>, onDone?: () => void) {
    setError(null);
    start(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message ?? null);
        return;
      }
      toast({ title: successLabel, tone: "success" });
      onDone?.();
    });
  }

  return { error, pending, run };
}

/** A control that will not act until a reason has been typed. */
function WithReason({
  label,
  placeholder,
  disabled,
  onConfirm,
}: {
  label: string;
  placeholder: string;
  disabled: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label={placeholder} hideLabel>
        <Input
          value={reason}
          maxLength={300}
          placeholder={placeholder}
          className="w-56"
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      <Button
        size="sm"
        variant="secondary"
        disabled={disabled || reason.trim() === ""}
        onClick={() => onConfirm(reason)}
      >
        {label}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        ×
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Referrals
 * ---------------------------------------------------------------------- */

export function ReferralActions({
  referralId,
  canReverse,
}: {
  referralId: string;
  canReverse: boolean;
}) {
  const t = useTranslations("adminConsole.referralsPage");
  const { error, pending, run } = useAction(t("title"));

  if (!canReverse) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      {error ? <span className="text-caption text-danger">{error}</span> : null}
      <WithReason
        label={t("reverse")}
        placeholder={t("reverseReason")}
        disabled={pending}
        onConfirm={(reason) => run(() => reverseReferralReward(referralId, reason))}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Partners and affiliates
 * ---------------------------------------------------------------------- */

export function PartnerActions({
  kind,
  id,
  status,
  defaultRate,
}: {
  kind: "partner" | "affiliate";
  id: string;
  status: string;
  defaultRate: number;
}) {
  const t = useTranslations("adminConsole.partnersPage");
  const { error, pending, run } = useAction(t("title"));
  const [rate, setRate] = useState(String(defaultRate));
  const [approving, setApproving] = useState(false);

  return (
    <div className="flex flex-col items-end gap-2">
      {error ? <span className="text-caption text-danger">{error}</span> : null}

      {status !== "approved" ? (
        approving ? (
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t("rate")}>
              <Input
                type="number"
                min={0}
                max={10_000}
                value={rate}
                className="w-32"
                onChange={(event) => setRate(event.target.value)}
              />
            </Field>
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  () => decidePartner(kind, id, "approve", undefined, Number(rate)),
                  () => setApproving(false),
                )
              }
            >
              {t("approve")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setApproving(false)}>
              ×
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setApproving(true)}>
            {t("approve")}
          </Button>
        )
      ) : null}

      <div className="flex flex-wrap gap-1">
        {status === "approved" ? (
          <WithReason
            label={t("suspend")}
            placeholder={t("note")}
            disabled={pending}
            onConfirm={(note) => run(() => decidePartner(kind, id, "suspend", note))}
          />
        ) : null}

        {status === "applied" ? (
          <WithReason
            label={t("reject")}
            placeholder={t("note")}
            disabled={pending}
            onConfirm={(note) => run(() => decidePartner(kind, id, "reject", note))}
          />
        ) : null}
      </div>
    </div>
  );
}

export function CommissionActions({
  commissionId,
  state,
}: {
  commissionId: string;
  state: string;
}) {
  const t = useTranslations("adminConsole.partnersPage");
  const { error, pending, run } = useAction(t("title"));

  if (state === "paid" || state === "reversed") return null;

  return (
    <div className="flex flex-col items-end gap-1">
      {error ? <span className="text-caption text-danger">{error}</span> : null}
      <div className="flex flex-wrap gap-1">
        {state === "pending" ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => decideCommission(commissionId, "approve"))}
          >
            {t("approve")}
          </Button>
        ) : null}
        <WithReason
          label={t("reverse")}
          placeholder={t("note")}
          disabled={pending}
          onConfirm={(reason) =>
            run(() => decideCommission(commissionId, "reverse", reason))
          }
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Reviews
 * ---------------------------------------------------------------------- */

export function ReviewActions({
  reviewId,
  status,
  published,
}: {
  reviewId: string;
  status: string;
  published: boolean;
}) {
  const t = useTranslations("adminConsole.reviewsPage");
  const { error, pending, run } = useAction(t("title"));

  if (status === "invited" || status === "withdrawn") return null;

  return (
    <div className="flex flex-col items-end gap-1">
      {error ? <span className="text-caption text-danger">{error}</span> : null}

      <div className="flex flex-wrap gap-1">
        {published ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => moderateReview(reviewId, "unpublish"))}
          >
            {t("unpublish")}
          </Button>
        ) : (
          <>
            {status !== "approved" ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => run(() => moderateReview(reviewId, "approve"))}
              >
                {t("approve")}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => moderateReview(reviewId, "publish"))}
            >
              {t("publish")}
            </Button>
          </>
        )}

        <WithReason
          label={t("reject")}
          placeholder={t("rejectReason")}
          disabled={pending}
          onConfirm={(note) => run(() => moderateReview(reviewId, "reject", note))}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * The build wall
 * ---------------------------------------------------------------------- */

export interface ShowcaseFormValues {
  title: string;
  summary: string;
  industry: string;
  technologies: string;
  screenshots: string;
  customerLabel: string;
  sortOrder: number;
}

export function ShowcaseActions({
  entryId,
  published,
  hasConsent,
  values,
}: {
  entryId: string;
  published: boolean;
  hasConsent: boolean;
  values: ShowcaseFormValues;
}) {
  const t = useTranslations("adminConsole.showcasePage");
  const { error, pending, run } = useAction(t("title"));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(values);

  function set<K extends keyof ShowcaseFormValues>(key: K, value: ShowcaseFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function save() {
    run(
      () =>
        saveShowcaseEntry(entryId, {
          title: form.title,
          summary: form.summary,
          industry: form.industry.trim() || null,
          // Split here rather than asking an administrator to type JSON.
          technologies: splitList(form.technologies),
          screenshots: splitList(form.screenshots),
          customerLabel: form.customerLabel.trim() || null,
          reviewId: null,
          sortOrder: Number(form.sortOrder),
        }),
      () => setOpen(false),
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <Callout tone="danger" live title={error} /> : null}

      {open ? (
        <div className="flex w-full max-w-xl flex-col gap-3">
          <Field label={t("fields.title")}>
            <Input
              value={form.title}
              maxLength={120}
              onChange={(event) => set("title", event.target.value)}
            />
          </Field>

          <Field label={t("fields.summary")}>
            <Textarea
              value={form.summary}
              rows={3}
              maxLength={600}
              onChange={(event) => set("summary", event.target.value)}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("fields.industry")}>
              <Input
                value={form.industry}
                maxLength={80}
                onChange={(event) => set("industry", event.target.value)}
              />
            </Field>
            <Field label={t("fields.customerLabel")}>
              <Input
                value={form.customerLabel}
                maxLength={120}
                onChange={(event) => set("customerLabel", event.target.value)}
              />
            </Field>
            <Field label={t("fields.technologies")}>
              <Input
                value={form.technologies}
                onChange={(event) => set("technologies", event.target.value)}
              />
            </Field>
            <Field label={t("fields.screenshots")}>
              <Input
                value={form.screenshots}
                onChange={(event) => set("screenshots", event.target.value)}
              />
            </Field>
            <Field label={t("fields.sortOrder")}>
              <Input
                type="number"
                min={0}
                max={999}
                value={String(form.sortOrder)}
                onChange={(event) => set("sortOrder", Number(event.target.value))}
              />
            </Field>
          </div>

          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={save}>
              {t("save")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
            {t("edit")}
          </Button>

          {/* Publishing is offered only where consent exists. The server
              refuses it regardless, but offering a button that cannot work is
              its own small dishonesty. */}
          {hasConsent ? (
            <Button
              size="sm"
              variant={published ? "ghost" : "secondary"}
              disabled={pending}
              onClick={() => run(() => setShowcasePublished(entryId, !published))}
            >
              {published ? t("unpublish") : t("publish")}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
