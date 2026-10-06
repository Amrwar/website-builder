"use client";

import { useState, useTransition } from "react";

import { CheckCircle2, CircleDashed, MinusCircle, Rocket } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import type { ChecklistGroup, ChecklistState } from "@/db/schema/enums";
import type { BlockerCode } from "@/lib/launch/readiness";
import { cn } from "@/lib/cn";
import { goLive, updateChecklistItem } from "@/server/launch-actions";

/**
 * The launch checklist, and the button that goes live.
 *
 * Interactive, so a client component -- but it decides nothing. The states it
 * renders were computed on the server from recorded facts, and every control
 * calls back to a server action that re-derives readiness before acting. The
 * Go live button being enabled is a convenience; the refusal lives in
 * `launchProject`.
 *
 * Which items exist is not written here. The list arrives as data, because the
 * brief was explicit that the checklist must not be hard-coded into the UI --
 * and because a product with a different launch needs a different list, not a
 * different component.
 */

export interface ChecklistRow {
  key: string;
  group: ChecklistGroup;
  translationKey: string;
  isRequired: boolean;
  state: ChecklistState;
  note: string | null;
}

const GROUP_ORDER: readonly ChecklistGroup[] = ["customer", "technical", "compliance"];

const ICON: Record<ChecklistState, typeof CheckCircle2> = {
  done: CheckCircle2,
  not_applicable: MinusCircle,
  pending: CircleDashed,
};

const TONE: Record<ChecklistState, string> = {
  done: "text-success",
  not_applicable: "text-tertiary",
  pending: "text-tertiary",
};

export function LaunchChecklist({
  projectId,
  rows,
  canEdit,
  readiness,
  blockers,
  canLaunch,
}: {
  projectId: string;
  rows: readonly ChecklistRow[];
  /** True for staff holding `build:execute`. Re-checked by the server. */
  canEdit: boolean;
  readiness: { completed: number; required: number; percent: number; ready: boolean };
  blockers: readonly BlockerCode[];
  canLaunch: boolean;
}) {
  const t = useTranslations("workspace.launch");
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);

  /**
   * Checklist labels come from the database, so a key can exist that the
   * catalogue has never heard of. Showing the raw key is a legible fallback;
   * an untranslated item is a copy problem, not a reason for the page to break
   * in front of a customer.
   */
  const label = (key: string): string => {
    const path = `items.${key}`;
    return t.has(path as never) ? t(path as never) : key;
  };
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  function set(itemKey: string, state: ChecklistState, reason?: string) {
    setError(null);
    start(async () => {
      const result = await updateChecklistItem(projectId, itemKey, state, reason);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setNoteFor(null);
      setNote("");
    });
  }

  function launch() {
    setError(null);
    start(async () => {
      const result = await goLive(projectId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast({ title: t("ready"), tone: "success" });
    });
  }

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: rows.filter((row) => row.group === group),
  })).filter((entry) => entry.items.length > 0);

  return (
    <div className="flex flex-col gap-6">
      {error ? <Callout tone="danger" live title={error} /> : null}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-eyebrow text-tertiary uppercase">{t("checklist")}</p>
          <span className="flex items-center gap-2">
            {/* Stated as well as counted: "9 of 11" leaves the reader to work
                out whether that is enough, and the answer also depends on
                facts outside the checklist. */}
            <Badge tone={readiness.ready ? "success" : "neutral"}>
              {readiness.ready ? t("ready") : t("notReady")}
            </Badge>
            <span className="text-caption text-secondary">
              {t("readiness", {
                completed: readiness.completed,
                required: readiness.required,
              })}
            </span>
          </span>
        </div>
        <Progress value={readiness.percent} label={t("checklist")} />
      </div>

      {grouped.map(({ group, items }) => (
        <section key={group} className="flex flex-col gap-3">
          <h3 className="text-caption text-secondary">{t(`groups.${group}`)}</h3>

          <ul className="flex flex-col gap-3">
            {items.map((row) => {
              const Icon = ICON[row.state];

              return (
                <li key={row.key} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <span className="flex items-start gap-2.5">
                      <Icon
                        className={cn("mt-0.5 size-4 shrink-0", TONE[row.state])}
                        aria-hidden
                      />
                      <span className="flex flex-col gap-0.5">
                        <span
                          className={cn(
                            "text-body-sm",
                            row.state === "done" ? "text-primary" : "text-secondary",
                          )}
                        >
                          {label(row.translationKey)}
                        </span>
                        {!row.isRequired ? (
                          <span className="text-caption text-tertiary">
                            {t("optional")}
                          </span>
                        ) : null}
                        {row.note ? (
                          <span className="text-caption text-tertiary">{row.note}</span>
                        ) : null}
                      </span>
                    </span>

                    {canEdit ? (
                      <span className="flex shrink-0 flex-wrap gap-1">
                        {row.state === "done" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => set(row.key, "pending")}
                          >
                            {t("markPending")}
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={pending}
                              onClick={() => set(row.key, "done")}
                            >
                              {t("markDone")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={pending}
                              onClick={() => {
                                setNoteFor(row.key);
                                setNote("");
                              }}
                            >
                              {t("markNotApplicable")}
                            </Button>
                          </>
                        )}
                      </span>
                    ) : (
                      <Badge tone={row.state === "done" ? "success" : "neutral"}>
                        {t(`state.${row.state}`)}
                      </Badge>
                    )}
                  </div>

                  {noteFor === row.key ? (
                    <div className="flex flex-wrap items-end gap-2 ps-6">
                      {/* A placeholder is not a label: it disappears on focus
                          and is announced inconsistently. `hideLabel` keeps the
                          compact look without costing the accessible name. */}
                      <Field label={t("noteLabel")} hideLabel>
                        <Input
                          value={note}
                          maxLength={200}
                          placeholder={t("noteLabel")}
                          className="w-64"
                          onChange={(event) => setNote(event.target.value)}
                        />
                      </Field>
                      <Button
                        size="sm"
                        disabled={pending || note.trim() === ""}
                        onClick={() => set(row.key, "not_applicable", note)}
                      >
                        {t("markNotApplicable")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setNoteFor(null)}>
                        ×
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {blockers.length > 0 ? (
        <Callout tone="warning" title={t("blockers")}>
          <ul className="flex list-disc flex-col gap-1 ps-4">
            {blockers.map((code) => (
              <li key={code}>{t(`blocker.${code}`)}</li>
            ))}
          </ul>
        </Callout>
      ) : null}

      {canLaunch ? (
        <Button
          className="self-start"
          disabled={pending || !readiness.ready}
          startIcon={<Rocket className="size-4" />}
          onClick={launch}
        >
          {t("goLive")}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Asking for more work on a project that already exists.
 *
 * Deliberately not a link to the configurator. Starting a new build would
 * throw away the brief, the files, the conversation and the deployment history
 * that make the second piece of work cheaper than the first.
 */
export function BuildMore({
  projectId,
  available,
  creditHours,
  creditMinutes,
}: {
  projectId: string;
  available: boolean;
  creditHours: number;
  creditMinutes: number;
}) {
  const t = useTranslations("workspace.launch.buildMore");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    start(async () => {
      const { buildMore } = await import("@/server/launch-actions");
      const result = await buildMore(projectId, summary, detail);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast({ title: t("sent", { reference: result.reference }), tone: "success" });
      setOpen(false);
      setSummary("");
      setDetail("");
    });
  }

  return (
    <div className="flex flex-col gap-3 border-t border-line-subtle pt-6">
      <h3 className="text-body font-medium text-primary">{t("title")}</h3>
      <p className="text-body-sm text-secondary">{t("body")}</p>

      <p className="text-caption text-tertiary">
        {creditHours + creditMinutes > 0
          ? t("credit", { hours: creditHours, minutes: creditMinutes })
          : t("noCredit")}
      </p>

      {!available ? (
        <p className="text-caption text-tertiary">{t("notYet")}</p>
      ) : !open ? (
        <Button variant="secondary" className="self-start" onClick={() => setOpen(true)}>
          {t("action")}
        </Button>
      ) : (
        <div className="flex max-w-xl flex-col gap-3">
          {error ? <Callout tone="danger" live title={error} /> : null}

          <Field label={t("summary")}>
            <Input
              value={summary}
              maxLength={160}
              onChange={(event) => setSummary(event.target.value)}
            />
          </Field>

          <Field label={t("detail")}>
            <Textarea
              value={detail}
              maxLength={5000}
              rows={4}
              onChange={(event) => setDetail(event.target.value)}
            />
          </Field>

          <div className="flex gap-2">
            <Button
              disabled={pending || summary.trim() === "" || detail.trim() === ""}
              onClick={submit}
            >
              {t("submit")}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              ×
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
