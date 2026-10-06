"use client";

import { useState } from "react";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";

/**
 * The customer's referral link.
 *
 * Shows the code as well as the link, because the two get shared differently:
 * a link goes in a message, a code gets said out loud. The alphabet the code
 * is drawn from exists for the second case.
 *
 * Deliberately shows nothing about who used it. A referrer learning that
 * `sam@example.com` signed up through their link would be a privacy leak
 * dressed as a feature; the counts are enough to know it is working.
 */
export function ReferralPanel({
  code,
  url,
  visits,
  signedUp,
  converted,
  earnedHours,
  earnedMinutes,
  pending,
}: {
  code: string;
  url: string;
  visits: number;
  signedUp: number;
  converted: number;
  earnedHours: number;
  earnedMinutes: number;
  pending: number;
}) {
  const t = useTranslations("growth.referral");
  const [copied, setCopied] = useState<"code" | "url" | null>(null);

  async function copy(value: string, which: "code" | "url") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard access can be refused outright. The value is on screen and
      // selectable either way, so this is a convenience that failed, not an
      // error worth interrupting somebody with.
    }
  }

  const stats = [
    { id: "visits", value: visits },
    { id: "signedUp", value: signedUp },
    { id: "converted", value: converted },
  ] as const;

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-display-sm text-primary">{t("title")}</h2>
        <p className="max-w-2xl text-body-sm text-secondary">{t("lede")}</p>
      </div>

      <Card padding="lg" className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-eyebrow text-tertiary uppercase">{t("code")}</span>
            <div className="flex items-center gap-2">
              <span className="text-display-sm text-primary" data-numeric>
                {code}
              </span>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t("copy")}
                startIcon={
                  copied === "code" ? (
                    <Check className="size-4" />
                  ) : (
                    <Copy className="size-4" />
                  )
                }
                onClick={() => copy(code, "code")}
              >
                {copied === "code" ? t("copied") : t("copy")}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-eyebrow text-tertiary uppercase">{t("link")}</span>
            <div className="flex items-center gap-2">
              <span className="truncate text-body-sm text-secondary" data-numeric>
                {url}
              </span>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t("copy")}
                startIcon={
                  copied === "url" ? (
                    <Check className="size-4" />
                  ) : (
                    <Copy className="size-4" />
                  )
                }
                onClick={() => copy(url, "url")}
              >
                {copied === "url" ? t("copied") : t("copy")}
              </Button>
            </div>
          </div>
        </div>

        <dl className="grid gap-4 border-t border-line-subtle pt-5 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.id} className="flex flex-col gap-1">
              <dt className="text-caption text-tertiary">{t(`stats.${stat.id}`)}</dt>
              <dd className="text-display-sm text-primary" data-numeric>
                {stat.value}
              </dd>
            </div>
          ))}

          <div className="flex flex-col gap-1">
            <dt className="text-caption text-tertiary">{t("stats.earned")}</dt>
            <dd className="text-display-sm text-primary">
              {t("earnedValue", { hours: earnedHours, minutes: earnedMinutes })}
            </dd>
          </div>
        </dl>

        {signedUp === 0 ? (
          <p className="text-body-sm text-secondary">{t("none")}</p>
        ) : null}

        {/* Stated rather than hidden. A referral held for review that looked
            like it had simply not happened is a support ticket. */}
        {pending > 0 ? (
          <Callout tone="info" title={t("pending", { count: pending })} />
        ) : null}

        <p className="text-caption text-tertiary">{t("terms")}</p>
      </Card>
    </section>
  );
}
