"use client";

import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { ValidationStatus } from "@/config/validation";
import { useRouter } from "@/i18n/navigation";
import { savePrefill } from "@/lib/business/prefill";
import type { StartPrefill } from "@/lib/validation/content";
import { changeValidationStatus } from "@/server/validation-actions";

/** The owner's controls on a test's results page. */

export function CopyLink({ url }: { url: string }) {
  const t = useTranslations("ideas");
  const { toast } = useToast();
  return (
    <Button
      variant="secondary"
      size="sm"
      startIcon={<Copy className="size-4" />}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          toast({ title: t("copied"), tone: "success" });
        } catch {
          toast({ title: t("copyFailed"), tone: "danger" });
        }
      }}
    >
      {t("copyLink")}
    </Button>
  );
}

export function StatusControls({ id, status }: { id: string; status: ValidationStatus }) {
  const t = useTranslations("ideas.controls");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (status === "closed") return null;

  function change(next: ValidationStatus) {
    setError(null);
    start(async () => {
      const result = await changeValidationStatus(id, next);
      if (!result.ok) {
        setError(t(`errors.${result.reason}`));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {status === "live" ? (
          <Button
            size="sm"
            variant="secondary"
            loading={pending}
            onClick={() => change("paused")}
          >
            {t("pause")}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            loading={pending}
            onClick={() => change("live")}
          >
            {t("resume")}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => change("closed")}
        >
          {t("close")}
        </Button>
      </div>
      <p className="text-caption text-tertiary">{t("closeNote")}</p>
      {error ? (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TurnIntoBusiness({ prefill }: { prefill: StartPrefill }) {
  const t = useTranslations("ideas");
  const router = useRouter();
  return (
    <Button
      size="lg"
      onClick={() => {
        savePrefill(prefill);
        router.push("/start");
      }}
    >
      {t("turnIntoBusiness")}
    </Button>
  );
}
