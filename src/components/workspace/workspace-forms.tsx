"use client";

import { useState, useTransition } from "react";

import { Check, Send, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  confirmAssets,
  postMessage,
  respondToApproval,
  respondToChangeRequest,
  submitChangeRequest,
} from "@/server/workspace-actions";

/**
 * The interactive parts of the Build Room.
 *
 * Grouped into one client module on purpose. The room is otherwise entirely
 * server-rendered, and five separate client files would mean five chunks for
 * what is really one small interaction surface.
 *
 * Every one of these follows the same shape: optimistic nothing, a pending
 * state the button actually shows, a server result that decides the outcome,
 * and an error surfaced in a live region rather than a silent failure.
 */

/** Shared submit plumbing: pending state, error, success toast. */
function useAction(successMessage?: string) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(
    action: () => Promise<{ ok: boolean; message?: string }>,
    onDone?: () => void,
  ) {
    setError(null);
    start(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message ?? null);
        return;
      }
      if (successMessage) toast({ title: successMessage, tone: "success" });
      onDone?.();
    });
  }

  return { pending, error, run };
}

/* -------------------------------------------------------------------------
 * Assets
 * ---------------------------------------------------------------------- */

export function ConfirmAssetsButton({
  projectId,
  reference,
  disabled,
}: {
  projectId: string;
  reference: string;
  disabled: boolean;
}) {
  const t = useTranslations("workspace");
  const { pending, error, run } = useAction(t("files.submitted"));

  return (
    <div className="flex flex-col gap-3">
      {error ? <Callout tone="danger" live title={error} /> : null}
      <Button
        onClick={() => run(() => confirmAssets(projectId, reference))}
        disabled={disabled || pending}
        loading={pending}
        loadingLabel={t("files.submitting")}
        startIcon={<Check className="size-4" />}
        className="self-start"
      >
        {t("files.submit")}
      </Button>
      {disabled ? (
        <p className="text-caption text-tertiary">{t("files.needFiles")}</p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Messages
 * ---------------------------------------------------------------------- */

export function MessageComposer({
  projectId,
  reference,
}: {
  projectId: string;
  reference: string;
}) {
  const t = useTranslations("workspace");
  const [body, setBody] = useState("");
  const { pending, error, run } = useAction();

  const canSend = body.trim() !== "" && !pending;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSend) return;
        run(
          () => postMessage(projectId, reference, body),
          () => setBody(""),
        );
      }}
    >
      {error ? <Callout tone="danger" live title={error} /> : null}

      <Field label={t("messages.placeholder")} hideLabel>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={3}
          maxLength={5000}
          placeholder={t("messages.placeholder")}
          className="w-full resize-y rounded-md border border-line bg-canvas px-3 py-2.5 text-body-sm text-primary placeholder:text-tertiary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        />
      </Field>

      <Button
        type="submit"
        disabled={!canSend}
        loading={pending}
        loadingLabel={t("messages.sending")}
        startIcon={<Send className="rtl-flip size-4" />}
        className="self-start"
      >
        {t("messages.send")}
      </Button>
    </form>
  );
}

/* -------------------------------------------------------------------------
 * Change requests
 * ---------------------------------------------------------------------- */

export function ChangeRequestForm({
  projectId,
  reference,
}: {
  projectId: string;
  reference: string;
}) {
  const t = useTranslations("workspace");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const { pending, error, run } = useAction();

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)} className="self-start">
        {t("changes.new")}
      </Button>
    );
  }

  const canSend = title.trim() !== "" && description.trim() !== "" && !pending;

  return (
    <form
      className="flex max-w-xl flex-col gap-4 rounded-lg border border-line p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSend) return;
        run(
          () => submitChangeRequest(projectId, reference, title, description),
          () => {
            setTitle("");
            setDescription("");
            setOpen(false);
          },
        );
      }}
    >
      {error ? <Callout tone="danger" live title={error} /> : null}

      <Field label={t("changes.titleLabel")}>
        <Input
          value={title}
          maxLength={160}
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>

      <Field label={t("changes.descriptionLabel")}>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={5}
          maxLength={5000}
          className="w-full resize-y rounded-md border border-line bg-canvas px-3 py-2.5 text-body-sm text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        />
      </Field>

      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          disabled={!canSend}
          loading={pending}
          loadingLabel={t("changes.submitting")}
        >
          {t("changes.submit")}
        </Button>
        <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
          {t("changes.cancel")}
        </Button>
      </div>
    </form>
  );
}

export function ChangeRequestDecision({
  changeRequestId,
  reference,
}: {
  changeRequestId: string;
  reference: string;
}) {
  const t = useTranslations("workspace");
  const { pending, error, run } = useAction();

  return (
    <div className="flex flex-col gap-2">
      {error ? <Callout tone="danger" live title={error} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            run(() => respondToChangeRequest(changeRequestId, reference, "approved"))
          }
          startIcon={<Check className="size-3.5" />}
        >
          {t("changes.approve")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            run(() => respondToChangeRequest(changeRequestId, reference, "rejected"))
          }
          startIcon={<X className="size-3.5" />}
        >
          {t("changes.reject")}
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Approvals
 * ---------------------------------------------------------------------- */

export function ApprovalDecision({
  approvalId,
  reference,
}: {
  approvalId: string;
  reference: string;
}) {
  const t = useTranslations("workspace");
  const [note, setNote] = useState("");
  const { pending, error, run } = useAction();

  return (
    <div className="flex flex-col gap-3">
      {error ? <Callout tone="danger" live title={error} /> : null}

      <Field label={t("approvals.noteLabel")}>
        <Input
          value={note}
          maxLength={500}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending}
          loading={pending}
          loadingLabel={t("approvals.deciding")}
          onClick={() =>
            run(() => respondToApproval(approvalId, reference, "approved", note))
          }
          startIcon={<Check className="size-4" />}
        >
          {t("approvals.approve")}
        </Button>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            run(() => respondToApproval(approvalId, reference, "changes_requested", note))
          }
        >
          {t("approvals.requestChanges")}
        </Button>
      </div>
    </div>
  );
}
