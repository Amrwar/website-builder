"use client";

import { useState, useTransition } from "react";

import { Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { beginPayment } from "@/server/checkout-actions";

/**
 * Starts payment.
 *
 * Carries no amount. It sends an order number; the server reads what to charge
 * from the order row it wrote itself. There is nothing here a devtools console
 * could edit into a cheaper purchase.
 *
 * The redirect URL is applied with `window.location.assign` rather than a
 * router push: the destination is the provider's own domain, and the client
 * router has no business trying to own that navigation.
 */
export function PayButton({ orderNumber }: { orderNumber: string }) {
  const t = useTranslations("checkout");
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Held true through the redirect so the button cannot be pressed twice while
  // the browser is on its way to the provider.
  const [leaving, setLeaving] = useState(false);
  const busy = pending || leaving;

  function pay() {
    setError(null);
    start(async () => {
      const result = await beginPayment(orderNumber, locale);
      if (!result.ok) {
        setError(result.message || t("payError"));
        return;
      }
      setLeaving(true);
      window.location.assign(result.redirectUrl);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <Callout tone="danger" live title={error} /> : null}

      <Button
        size="lg"
        onClick={pay}
        disabled={busy}
        loading={busy}
        loadingLabel={t("paying")}
        startIcon={<Lock className="size-4" />}
        className="self-start"
      >
        {t("pay")}
      </Button>
    </div>
  );
}
