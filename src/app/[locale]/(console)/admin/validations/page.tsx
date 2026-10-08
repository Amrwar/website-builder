import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { CloseValidation } from "@/components/admin/validation/close-validation";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableMessageRow,
  TableRow,
} from "@/components/ui/table";
import { DEFAULT_LOCALE } from "@/config/locales";
import { requireAdminSection } from "@/server/admin/guard";
import { viewerDates } from "@/server/i18n";
import { listExperimentsForStaff } from "@/server/validation/experiments";

export const metadata: Metadata = {
  title: "Validation pages",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const STATUS_TONE = { live: "success", paused: "warning", closed: "neutral" } as const;

/**
 * Every published idea test: what it says, who published it, how much
 * traffic it has had. Not who responded -- leads are the customer's.
 */
export default async function AdminValidationsPage({
  params,
}: PageProps<"/[locale]/admin/validations">) {
  const context = await requireAdminSection("validations");
  const { locale } = await params;
  const [t, dates, experiments] = await Promise.all([
    getTranslations("adminConsole.validationsPage"),
    viewerDates(locale),
    listExperimentsForStaff(context),
  ]);

  return (
    <AdminShell role={context.user.role} active="validations">
      <AdminPageHeader title={t("title")} subtitle={t("subtitle")} />
      <Table label={t("title")}>
        <TableHeader>
          <TableRow>
            <TableHead>{t("page")}</TableHead>
            <TableHead>{t("owner")}</TableHead>
            <TableHead>{t("created")}</TableHead>
            <TableHead numeric>{t("visitors")}</TableHead>
            <TableHead numeric>{t("leads")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead>
              <span className="sr-only">{t("actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {experiments.length === 0 ? (
            <TableMessageRow colSpan={7}>{t("empty")}</TableMessageRow>
          ) : (
            experiments.map((experiment) => {
              const prefix =
                experiment.locale === DEFAULT_LOCALE ? "" : `/${experiment.locale}`;
              return (
                <TableRow key={experiment.id}>
                  <TableCell>
                    <span className="flex flex-col gap-0.5">
                      <a
                        href={`${prefix}/v/${experiment.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline"
                        lang={experiment.locale}
                      >
                        {experiment.content.headline}
                      </a>
                      <span className="font-mono text-caption text-tertiary">
                        {experiment.slug}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>{experiment.ownerEmail}</TableCell>
                  <TableCell>{dates.date(experiment.createdAt)}</TableCell>
                  <TableCell numeric>{experiment.signals.visitors}</TableCell>
                  <TableCell numeric>{experiment.signals.leads}</TableCell>
                  <TableCell>
                    <Badge tone={STATUS_TONE[experiment.status]}>
                      {t(`statuses.${experiment.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {experiment.status !== "closed" ? (
                      <CloseValidation id={experiment.id} />
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </AdminShell>
  );
}
