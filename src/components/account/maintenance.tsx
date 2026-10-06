"use client";

import { useState, useTransition } from "react";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { SubscriptionStatus } from "@/db/schema/enums";
import {
  endSubscription,
  keepSubscription,
  subscribeToPlan,
  switchPlan,
} from "@/server/launch-actions";

/**
 * Maintenance plans, from the customer's side.
 *
 * The cancel flow is written around one rule: a customer who has paid for a
 * period keeps it. The confirmation names the date service actually ends and
 * says why, because "cancel" that reads as "my site goes off today" is the
 * reason people avoid the button and ring up instead.
 */

export interface PlanOption {
  key: string;
  priceLabel: string;
  featureKeys: readonly string[];
  isRecommended: boolean;
}

export interface CurrentSubscription {
  id: string;
  reference: string;
  planKey: string;
  status: SubscriptionStatus;
  priceLabel: string;
  periodEndLabel: string;
  trialEndsLabel: string | null;
  cancelAtPeriodEnd: boolean;
}

export function MaintenancePanel({
  plans,
  current,
  projectId,
}: {
  plans: readonly PlanOption[];
  current: CurrentSubscription | null;
  projectId: string | null;
}) {
  const t = useTranslations("maintenance");
  const tFeature = useTranslations("home.maintenance.features");
  const tPlan = useTranslations("home.maintenance.plans");
  const { toast } = useToast();

  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  /**
   * Plan keys and feature keys come from the database, so a key can exist that
   * the catalogue has never heard of. Falling back to the key is legible; an
   * untranslated plan is a copy problem, not a reason for a billing page to
   * break in front of the person paying.
   */
  const planName = (key: string): string => {
    const path = `${key}.name`;
    return tPlan.has(path as never) ? tPlan(path as never) : key;
  };

  const featureName = (key: string): string =>
    tFeature.has(key as never) ? tFeature(key as never) : key;

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    start(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message ?? null);
        return;
      }
      setConfirming(false);
      setReason("");
      toast({ title: t("title"), tone: "success" });
    });
  }

  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-display-sm text-primary">{t("title")}</h2>

      {error ? <Callout tone="danger" live title={error} /> : null}

      {current ? (
        <Card padding="lg" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-eyebrow text-tertiary uppercase">{t("current")}</p>
              <p className="text-body font-medium text-primary">
                {planName(current.planKey)}
              </p>
              <p className="text-caption text-secondary" data-numeric>
                {current.priceLabel} · {current.reference}
              </p>
            </div>

            <Badge
              tone={
                current.status === "active" || current.status === "trialing"
                  ? "success"
                  : current.status === "past_due"
                    ? "warning"
                    : "neutral"
              }
            >
              {t(`status.${current.status}`)}
            </Badge>
          </div>

          {current.status === "past_due" ? (
            // Said plainly, because the natural fear is that the site has gone
            // off. It has not, and that is worth more than a status chip.
            <Callout tone="warning" title={t("pastDueNote")} />
          ) : null}

          <p className="text-caption text-tertiary" data-numeric>
            {current.trialEndsLabel
              ? t("trialUntil", { date: current.trialEndsLabel })
              : current.cancelAtPeriodEnd
                ? t("endsOn", { date: current.periodEndLabel })
                : t("renews", { date: current.periodEndLabel })}
          </p>

          {current.cancelAtPeriodEnd ? (
            <Button
              variant="secondary"
              className="self-start"
              disabled={pending}
              onClick={() => run(() => keepSubscription(current.id))}
            >
              {t("keep")}
            </Button>
          ) : confirming ? (
            <div className="flex flex-col gap-3 border-t border-line-subtle pt-4">
              <p className="text-body-sm font-medium text-primary">{t("cancelTitle")}</p>
              <p className="text-body-sm text-secondary">
                {t("cancelBody", { date: current.periodEndLabel })}
              </p>

              <Input
                value={reason}
                maxLength={200}
                placeholder={t("cancelReason")}
                onChange={(event) => setReason(event.target.value)}
                className="max-w-md"
              />

              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      const result = await endSubscription(current.id, reason);
                      if (result.ok) {
                        toast({
                          title: t("cancelled", { date: current.periodEndLabel }),
                          tone: "neutral",
                        });
                      }
                      return result;
                    })
                  }
                >
                  {t("cancel")}
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  {t("keep")}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              className="self-start"
              onClick={() => setConfirming(true)}
            >
              {t("cancel")}
            </Button>
          )}
        </Card>
      ) : (
        <Callout tone="info" title={t("none")}>
          {t("noneBody")}
        </Callout>
      )}

      {/* --- The plans ------------------------------------------------------ */}
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = current?.planKey === plan.key;

          return (
            <Card
              key={plan.key}
              padding="lg"
              className="flex flex-col gap-4"
              surface={plan.isRecommended ? "subtle" : "outlined"}
            >
              <div className="flex flex-col gap-1">
                <p className="text-body font-medium text-primary">{planName(plan.key)}</p>
                <p className="text-display-sm text-primary" data-numeric>
                  {plan.priceLabel}
                </p>
              </div>

              <ul className="flex flex-col gap-2">
                {plan.featureKeys.map((key) => (
                  <li key={key} className="text-body-sm text-secondary">
                    {featureName(key)}
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <Badge tone="success">{t("current")}</Badge>
              ) : current ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      const result = await switchPlan(current.id, plan.key);
                      if (result.ok && !result.immediate) {
                        toast({
                          title: t("downgradeNote", {
                            date: current.periodEndLabel,
                          }),
                          tone: "neutral",
                        });
                      }
                      return result;
                    })
                  }
                >
                  {t("change")}
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => subscribeToPlan(plan.key, projectId))}
                >
                  {planName(plan.key)}
                </Button>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
