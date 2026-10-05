import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/layout/container";
import { PERMISSIONS, permissionsFor } from "@/config/roles";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = {
  title: "Staff",
  robots: { index: false, follow: false },
};

/**
 * Staff console.
 *
 * Gated on `admin:access`, enforced here rather than in the proxy. A customer
 * who guesses the URL gets the not-found page: reporting "forbidden" would
 * confirm the route exists, which is information they did not have.
 *
 * It currently shows what the signed-in role may do. That is deliberately the
 * whole page -- the console's actual tools belong to later phases, and the one
 * thing worth proving now is that authorization resolves correctly.
 */
export default async function AdminPage() {
  const { user, can } = await requirePermission("admin:access");
  const t = await getTranslations("admin");

  const granted = permissionsFor(user.role);

  return (
    <Container width="content" className="py-12 sm:py-16">
      <header className="mb-10 flex flex-col gap-3">
        <h1 className="text-display-lg text-primary">{t("title")}</h1>
        <p className="max-w-2xl text-body-lg text-secondary">{t("lede")}</p>
      </header>

      <Card padding="lg" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-eyebrow text-tertiary uppercase">{t("yourRole")}</span>
          <Badge tone="info">{t(`roles.${user.role}`)}</Badge>
        </div>

        <ul className="flex flex-col gap-2">
          {PERMISSIONS.map((permission) => {
            const allowed = can(permission);
            return (
              <li
                key={permission}
                className="flex items-center justify-between gap-4 border-b border-line-subtle pb-2"
              >
                <code className="text-caption text-secondary">{permission}</code>
                <Badge tone={allowed ? "success" : "neutral"}>
                  {allowed ? t("allowed") : t("denied")}
                </Badge>
              </li>
            );
          })}
        </ul>

        {/* Mirrors the granted set, so a mismatch between the table above and
            the role's definition would be visible rather than silent. */}
        <p className="text-caption text-tertiary">
          {t("summary", { count: granted.length, total: PERMISSIONS.length })}
        </p>
      </Card>
    </Container>
  );
}
