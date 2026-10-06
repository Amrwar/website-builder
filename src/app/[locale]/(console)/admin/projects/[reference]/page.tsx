import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { RiskBadge } from "@/components/admin/risk-badge";
import { Numeric } from "@/components/ui/numeric";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Separator } from "@/components/ui/separator";
import { db } from "@/db/client";
import {
  orders,
  productionTasks,
  projectEvents,
  projectMembers,
  projects,
  users,
} from "@/db/schema";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { Link } from "@/i18n/navigation";
import { formatMoney, money, type Currency } from "@/lib/pricing/money";
import type { RiskLevel } from "@/lib/production/risk";
import { viewerDates } from "@/server/i18n";
import { auditTrailFor } from "@/server/admin/audit";
import { requireAdminSection } from "@/server/admin/guard";

export const metadata: Metadata = {
  title: "Project",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * One project, from the inside.
 *
 * Read-only. The brief's instruction was that admins must not silently alter
 * critical historical information, so nothing on this page edits anything:
 * scope assessments are append-only, the guarantee timestamps are immutable at
 * the database level, and the acts that *are* permitted -- assignment, role
 * changes, refunds -- happen on their own screens where each writes an audit
 * entry.
 *
 * The risk reasons are shown next to the level, because a red project without
 * its explanation is not actionable.
 */
export default async function AdminProjectPage({
  params,
}: PageProps<"/[locale]/admin/projects/[reference]">) {
  const context = await requireAdminSection("projects");
  const { locale, reference } = await params;

  const t = await getTranslations("adminConsole");
  const tTier = await getTranslations("orderLines.tier");
  const { intlTag } = getLocaleDefinition(resolveLocale(locale));
  const dates = await viewerDates(locale);

  const project = await db.query.projects.findFirst({
    where: eq(projects.reference, reference),
  });
  if (!project) notFound();

  const [owner, order, tasks, team, activity, audit] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, project.ownerId) }),
    db.query.orders.findFirst({ where: eq(orders.projectId, project.id) }),
    db
      .select({
        id: productionTasks.id,
        taskKey: productionTasks.taskKey,
        stage: productionTasks.stage,
        status: productionTasks.status,
        responsibleRole: productionTasks.responsibleRole,
        estimatedMinutes: productionTasks.estimatedMinutes,
        actualMinutes: productionTasks.actualMinutes,
        blockedMinutes: productionTasks.blockedMinutes,
        assigneeId: productionTasks.assigneeId,
      })
      .from(productionTasks)
      .where(eq(productionTasks.projectId, project.id))
      .orderBy(productionTasks.orderIndex),
    db
      .select({ role: projectMembers.role, name: users.displayName, email: users.email })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(eq(projectMembers.projectId, project.id)),
    db
      .select()
      .from(projectEvents)
      .where(eq(projectEvents.projectId, project.id))
      .orderBy(projectEvents.occurredAt)
      .limit(100),
    auditTrailFor("project", project.id, context),
  ]);

  const when = (value: Date | null) => (value ? dates.dateTime(value) : t("common.none"));

  // Commercial detail follows the same rule as the customer list: a designer
  // sees who the project belongs to, not what they are worth.
  const seesFinance = context.can("finance:read");
  const riskReasons = (project.riskReasons ?? []) as { code: string }[];

  return (
    <AdminShell role={context.user.role} active="projects">
      <Link
        href="/admin/queue"
        className="mb-4 inline-flex w-fit items-center gap-1.5 text-body-sm text-secondary hover:text-primary"
      >
        <ArrowLeft className="rtl-flip size-4" aria-hidden />
        {t("projectDetail.back")}
      </Link>

      <AdminPageHeader
        title={project.reference}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">
              {t(`projectStatus.${project.status as "in_build"}`)}
            </Badge>
            <RiskBadge level={project.riskLevel as RiskLevel} />
          </div>
        }
      />

      {riskReasons.length > 0 ? (
        <div className="mb-6">
          <Callout
            tone={project.riskLevel === "red" ? "danger" : "warning"}
            title={t("queue.risk")}
          >
            <ul className="flex flex-wrap gap-2">
              {riskReasons.map((reason) => (
                <li key={reason.code} className="font-mono text-caption">
                  {reason.code}
                </li>
              ))}
            </ul>
          </Callout>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* --- Customer and order ---------------------------------------- */}
        <Card padding="lg" className="flex flex-col gap-3">
          <h2 className="text-eyebrow text-tertiary uppercase">
            {t("projectDetail.customer")}
          </h2>
          <p className="text-body text-primary">
            {owner?.displayName ?? owner?.email ?? t("common.none")}
          </p>
          {context.can("customer:read") && owner ? (
            <Link
              href={`/admin/customers/${owner.id}`}
              className="text-caption text-secondary hover:text-primary"
            >
              {owner.email}
            </Link>
          ) : null}
        </Card>

        <Card padding="lg" className="flex flex-col gap-3">
          <h2 className="text-eyebrow text-tertiary uppercase">
            {t("projectDetail.scope")}
          </h2>
          <dl className="flex flex-col gap-1.5 text-body-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-secondary">{t("scopeView.tier")}</dt>
              <dd className="text-primary">
                {project.scopeTier ? tTier(project.scopeTier) : t("common.none")}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-secondary">{t("pricing.days")}</dt>
              <dd className="text-primary">
                {project.guaranteedDays ? (
                  <Numeric>{project.guaranteedDays}</Numeric>
                ) : (
                  t("common.none")
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-secondary">{t("queue.product")}</dt>
              <dd className="text-primary">{project.productType}</dd>
            </div>
          </dl>
        </Card>

        <Card padding="lg" className="flex flex-col gap-3">
          <h2 className="text-eyebrow text-tertiary uppercase">
            {t("projectDetail.order")}
          </h2>
          {order && seesFinance ? (
            <>
              <p className="text-body text-primary" data-numeric>
                {formatMoney(
                  money(order.totalMinorUnits, order.currency as Currency),
                  intlTag,
                )}
              </p>
              <Link
                href={`/admin/payments?q=${order.number}`}
                className="text-caption text-secondary hover:text-primary"
                data-numeric
              >
                {order.number}
              </Link>
            </>
          ) : (
            <p className="text-caption text-tertiary">
              {order ? t("dashboard.financeHidden") : t("common.none")}
            </p>
          )}
        </Card>
      </div>

      {/* --- The guarantee, read-only ------------------------------------ */}
      <Card padding="lg" className="mt-4 flex flex-col gap-3">
        <h2 className="text-eyebrow text-tertiary uppercase">
          {t("settings.guarantee")}
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ["paidAt", project.paidAt],
              ["assetsSubmittedAt", project.assetsSubmittedAt],
              ["buildStartedAt", project.buildStartedAt],
              ["deadlineAt", project.deadlineAt],
            ] as const
          ).map(([key, value]) => (
            <div key={key} className="flex flex-col gap-0.5">
              <dt className="font-mono text-caption text-tertiary">{key}</dt>
              <dd className="text-body-sm text-primary" data-numeric>
                {when(value)}
              </dd>
            </div>
          ))}
        </dl>
        {/* Stated on the screen, because it is the thing an operator most
            needs to know they cannot quietly do. */}
        <p className="text-caption text-tertiary">{t("audit.immutable")}</p>
      </Card>

      {/* --- Team --------------------------------------------------------- */}
      <Card padding="lg" className="mt-4 flex flex-col gap-3">
        <h2 className="text-eyebrow text-tertiary uppercase">
          {t("projectDetail.team")}
        </h2>
        {team.length === 0 ? (
          <p className="text-body-sm text-secondary">{t("common.none")}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {team.map((member) => (
              <li
                key={member.email}
                className="flex items-center gap-2 rounded-md border border-line px-3 py-1.5"
              >
                <span className="text-body-sm text-primary">
                  {member.name ?? member.email}
                </span>
                <Badge tone="neutral">{t(`roleNames.${member.role}`)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* --- Production plan ---------------------------------------------- */}
      <Card padding="lg" className="mt-4 flex flex-col gap-4">
        <h2 className="text-eyebrow text-tertiary uppercase">
          {t("projectDetail.tasks")}
        </h2>

        {tasks.length === 0 ? (
          <EmptyState size="sm" title={t("projectDetail.noTasks")} />
        ) : (
          <ul className="flex flex-col gap-2">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle pb-2 last:border-0"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-body-sm text-primary">
                    {task.taskKey.replace(/_/g, " ")}
                  </span>
                  <span className="text-caption text-tertiary">
                    {task.stage} · {t(`roleNames.${task.responsibleRole}`)}
                  </span>
                </span>

                <span className="flex items-center gap-3">
                  <span className="text-caption text-tertiary">
                    {t("projectDetail.minutes", { count: task.estimatedMinutes })}
                    {task.actualMinutes !== null
                      ? ` → ${t("projectDetail.minutes", { count: task.actualMinutes })}`
                      : ""}
                  </span>
                  <Badge
                    tone={
                      task.status === "done"
                        ? "success"
                        : task.status === "blocked"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {task.status}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* --- History ------------------------------------------------------- */}
      <Card padding="lg" className="mt-4 flex flex-col gap-4">
        <h2 className="text-eyebrow text-tertiary uppercase">
          {t("projectDetail.timeline")}
        </h2>

        {activity.length === 0 ? (
          <EmptyState size="sm" title={t("table.empty")} />
        ) : (
          <ol className="flex flex-col gap-2">
            {activity.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-baseline justify-between gap-3"
              >
                <span className="font-mono text-caption text-primary">{event.type}</span>
                <span className="text-caption text-tertiary">
                  {t(`projectDetail.actorType.${event.actorType}`)} ·{" "}
                  <Numeric>{when(event.occurredAt)}</Numeric>
                </span>
              </li>
            ))}
          </ol>
        )}

        {audit.length > 0 ? (
          <>
            <Separator />
            <h3 className="text-eyebrow text-tertiary uppercase">{t("audit.title")}</h3>
            <ol className="flex flex-col gap-2">
              {audit.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-baseline justify-between gap-3"
                >
                  <span className="font-mono text-caption text-primary">
                    {entry.action}
                  </span>
                  <span className="text-caption text-tertiary">
                    <Numeric>{entry.actorEmail}</Numeric> ·{" "}
                    <Numeric>{when(entry.occurredAt)}</Numeric>
                  </span>
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </Card>
    </AdminShell>
  );
}
