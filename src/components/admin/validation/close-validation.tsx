"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { closeValidationAction } from "@/server/admin-actions";

/**
 * Takes a customer's validation page down. Asks for a reason, which goes
 * into the audit entry -- closing someone's public page is a decision the
 * business should be able to explain later.
 */
export function CloseValidation({ id }: { id: string }) {
  const t = useTranslations("adminConsole.validationsPage");
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        aria-label={t("reason")}
        placeholder={t("reason")}
        value={reason}
        maxLength={500}
        className="w-48"
        onChange={(event) => setReason(event.target.value)}
      />
      <Button
        size="sm"
        variant="secondary"
        loading={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await closeValidationAction(id, reason);
            if (!result.ok) {
              setError(result.message);
              return;
            }
            router.refresh();
          })
        }
      >
        {t("close")}
      </Button>
      {error ? (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
