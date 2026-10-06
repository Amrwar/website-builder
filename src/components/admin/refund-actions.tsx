"use client";

import { useState, useTransition } from "react";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { approveRefund, declineRefund } from "@/server/admin-actions";

/**
 * Releasing or declining a refund.
 *
 * Rendered only for roles holding `refund:execute`, and only on requests the
 * signed-in person did not raise. Neither condition is trusted: the server
 * applies both again, and refuses with the same message a hidden button would
 * have prevented.
 */
export function RefundActions({
  refundId,
  canExecute,
  isOwnRequest,
}: {
  refundId: string;
  canExecute: boolean;
  isOwnRequest: boolean;
}) {
  const t = useTranslations("adminConsole.refunds");
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [declining, setDeclining] = useState(false);
  const [pending, start] = useTransition();

  if (!canExecute) {
    return <span className="text-caption text-tertiary">{t("cannotExecute")}</span>;
  }

  if (isOwnRequest) {
    // Stated rather than silently disabled: the person needs to know why they
    // cannot release it, and that someone else must.
    return <span className="text-caption text-warning">{t("selfApproval")}</span>;
  }

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    start(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message ?? null);
        return;
      }
      toast({ title: t("title"), tone: "success" });
      setDeclining(false);
      setNote("");
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <Callout tone="danger" live title={error} /> : null}

      {declining ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("reason")}
            className="w-56"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={note.trim() === "" || pending}
            onClick={() => run(() => declineRefund(refundId, note))}
          >
            {t("reject")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDeclining(false)}>
            ×
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={pending}
            loading={pending}
            loadingLabel={t("approving")}
            startIcon={<Check className="size-3.5" />}
            onClick={() => run(() => approveRefund(refundId))}
          >
            {t("approve")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            startIcon={<X className="size-3.5" />}
            onClick={() => setDeclining(true)}
          >
            {t("reject")}
          </Button>
        </div>
      )}
    </div>
  );
}
