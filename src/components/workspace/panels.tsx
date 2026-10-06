import {
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Lock,
  MessageSquare,
  Paperclip,
  Rocket,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Separator } from "@/components/ui/separator";
import { StageRail } from "@/components/workspace/stage-rail";
import { DeadlineSummary } from "@/components/workspace/deadline-summary";
import { FileUpload } from "@/components/workspace/file-upload";
import {
  ApprovalDecision,
  ChangeRequestDecision,
  ChangeRequestForm,
  ConfirmAssetsButton,
  MessageComposer,
} from "@/components/workspace/workspace-forms";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatMoney, money, type Currency } from "@/lib/pricing/money";
import type { Workspace } from "@/server/workspace/queries";
import { cn } from "@/lib/cn";

/**
 * The Build Room panels.
 *
 * Each is a server component taking the assembled `Workspace`. None of them
 * queries, and none of them decides who may see what -- both happen once, in
 * `server/workspace/queries`, so a panel cannot leak by forgetting a check.
 *
 * Every panel renders a real empty state rather than disappearing. A customer
 * who opens "Files" on day one should be told what goes there, not shown a
 * blank rectangle.
 */

interface PanelProps {
  workspace: Workspace;
  intlTag: string;
}

function formatDate(date: Date, intlTag: string): string {
  return new Intl.DateTimeFormat(intlTag, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/* -------------------------------------------------------------------------
 * Overview
 * ---------------------------------------------------------------------- */

export async function OverviewPanel({ workspace, intlTag }: PanelProps) {
  const t = await getTranslations("workspace");
  const { project, stages, nextAction, deadline, team, order } = workspace;

  const currentIndex = stages.findIndex((entry) => entry.state === "current");

  return (
    <div className="flex flex-col gap-6">
      {/* The single next step, given the most prominent position on the page.
          A list of five things a customer could do tells them nothing about
          what is actually blocking delivery. */}
      <Card padding="lg" className="flex flex-col gap-2">
        <p className="text-eyebrow text-tertiary uppercase">{t("nextAction.title")}</p>
        <p className="text-body-lg text-primary">
          {nextAction ? t(`nextAction.${nextAction as "pay"}`) : t("nextAction.none")}
        </p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card padding="lg">
          <DeadlineSummary
            deadline={deadline}
            guaranteedDays={project.guaranteedDays}
            intlTag={intlTag}
          />
        </Card>

        <Card padding="lg" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-eyebrow text-tertiary uppercase">
              {t("overview.progress")}
            </p>
            <p className="text-body font-medium text-primary">
              {currentIndex >= 0
                ? t("overview.stageCount", {
                    current: currentIndex + 1,
                    total: stages.length,
                  })
                : t(`status.${project.status}`)}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <dt className="text-eyebrow text-tertiary uppercase">
                {t("overview.scope")}
              </dt>
              <dd className="text-body-sm text-secondary">{project.scopeTier ?? "—"}</dd>
            </div>
            {order ? (
              <div className="flex flex-col gap-1">
                <dt className="text-eyebrow text-tertiary uppercase">
                  {t("overview.paid")}
                </dt>
                <dd className="text-body-sm text-secondary" data-numeric>
                  {formatMoney(
                    money(order.totalMinorUnits, order.currency as Currency),
                    intlTag,
                  )}
                </dd>
              </div>
            ) : null}
          </dl>
        </Card>
      </div>

      <Card padding="lg" className="flex flex-col gap-5">
        <p className="text-eyebrow text-tertiary uppercase">{t("overview.team")}</p>
        {team.length <= 1 ? (
          <p className="text-body-sm text-secondary">{t("overview.teamEmpty")}</p>
        ) : (
          <ul className="flex flex-wrap gap-3">
            {team.map((member) => (
              <li
                key={member.userId}
                className="flex items-center gap-2.5 rounded-md border border-line px-3 py-2"
              >
                <span className="text-body-sm text-primary">{member.name}</span>
                <Badge tone="neutral">{member.role}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {project.guaranteedDays ? (
        <Callout tone="info" title={t("guarantee.title")}>
          {t("guarantee.body", { days: project.guaranteedDays })}
        </Callout>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Timeline
 * ---------------------------------------------------------------------- */

const KNOWN_EVENTS = new Set([
  "order.fulfilled",
  "assets.submitted",
  "build.started",
  "preview.published",
  "message.posted",
  "change.requested",
  "change.approved",
  "change.rejected",
  "change.withdrawn",
  "file.uploaded",
  "deployment.started",
  "deployment.completed",
]);

export async function TimelinePanel({ workspace, intlTag }: PanelProps) {
  const t = await getTranslations("workspace");
  const { stages, activity } = workspace;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-5">
        <h2 className="text-display-sm text-primary">{t("timeline.stages")}</h2>
        <StageRail stages={stages} />
      </section>

      <Separator />

      <section className="flex flex-col gap-5">
        <h2 className="text-display-sm text-primary">{t("timeline.title")}</h2>

        {activity.length === 0 ? (
          <EmptyState
            size="sm"
            title={t("timeline.title")}
            description={t("timeline.empty")}
          />
        ) : (
          <ol className="flex flex-col">
            {activity.map((event) => (
              <li
                key={event.id}
                className="flex items-start gap-3.5 border-s border-line ps-5 pb-6 last:pb-0"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-body-sm font-medium text-primary">
                    {KNOWN_EVENTS.has(event.type)
                      ? t(`event.${event.type as "build.started"}`)
                      : t("event.fallback")}
                  </span>
                  <time
                    className="text-caption text-tertiary"
                    dateTime={event.occurredAt.toISOString()}
                    data-numeric
                  >
                    {formatDate(event.occurredAt, intlTag)}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Preview
 * ---------------------------------------------------------------------- */

export async function PreviewPanel({ workspace, intlTag }: PanelProps) {
  const t = await getTranslations("workspace");
  const { definition, deployments, latestPreview } = workspace;

  if (!definition.hasPreviewUrl) {
    return (
      <EmptyState
        size="sm"
        title={t("preview.title")}
        description={t("preview.notApplicable")}
      />
    );
  }

  if (deployments.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={<ExternalLink className="size-6" />}
        title={t("preview.title")}
        description={t("preview.none")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {latestPreview ? (
        <Card padding="lg" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-body font-medium text-primary">
                {t("preview.version", { version: latestPreview.version })}
              </p>
              {latestPreview.readyAt ? (
                <p className="text-caption text-tertiary" data-numeric>
                  {t("preview.deployed", {
                    date: formatDate(latestPreview.readyAt, intlTag),
                  })}
                </p>
              ) : null}
            </div>
            <Badge tone="success">{t(`preview.state.${latestPreview.state}`)}</Badge>
          </div>

          {latestPreview.url ? (
            <a
              href={latestPreview.url}
              target="_blank"
              rel="noreferrer noopener"
              className={cn(buttonVariants({ variant: "primary" }), "self-start")}
            >
              {t("preview.open")}
              <ArrowUpRight className="rtl-flip size-4" aria-hidden />
            </a>
          ) : null}
        </Card>
      ) : null}

      <ul className="flex flex-col gap-2">
        {deployments.map((deployment) => (
          <li
            key={deployment.id}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle pb-2"
          >
            <span className="text-body-sm text-secondary" data-numeric>
              {t("preview.version", { version: deployment.version })}
            </span>
            <Badge tone={deployment.state === "failed" ? "danger" : "neutral"}>
              {t(`preview.state.${deployment.state}`)}
            </Badge>
          </li>
        ))}
      </ul>

      {deployments.some((deployment) => deployment.state === "failed") ? (
        <Callout tone="warning" title={t("preview.state.failed")}>
          {t("preview.failedHelp")}
        </Callout>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Files
 * ---------------------------------------------------------------------- */

export async function FilesPanel({ workspace, intlTag }: PanelProps) {
  const t = await getTranslations("workspace");
  const { project, files, viewer } = workspace;

  const customerUploads = files.filter((file) => file.kind === "customer_upload");
  const awaitingAssets = project.status === "awaiting_assets";

  return (
    <div className="flex flex-col gap-6">
      <FileUpload projectId={project.id} reference={project.reference} />

      {awaitingAssets && viewer.isOwner ? (
        <Card padding="lg" className="flex flex-col gap-4">
          <h2 className="text-display-sm text-primary">{t("files.submitTitle")}</h2>
          <p className="max-w-2xl text-body-sm text-secondary">{t("files.submitBody")}</p>
          <ConfirmAssetsButton
            projectId={project.id}
            reference={project.reference}
            disabled={customerUploads.length === 0}
          />
        </Card>
      ) : null}

      {project.assetsSubmittedAt ? (
        <Callout tone="success" title={t("files.submitted")} />
      ) : null}

      {files.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<FileText className="size-6" />}
          title={t("files.empty")}
          description={viewer.isOwner ? t("files.emptyCustomer") : undefined}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line px-4 py-3"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-body-sm font-medium text-primary">
                  {file.name}
                </span>
                <span className="flex flex-wrap items-center gap-2 text-caption text-tertiary">
                  <span>{t(`files.kind.${file.kind}`)}</span>
                  <span data-numeric>
                    {t("files.version", { version: file.version })}
                  </span>
                  <span data-numeric>{formatDate(file.createdAt, intlTag)}</span>
                  {file.visibility === "internal" ? (
                    <span className="inline-flex items-center gap-1">
                      <Lock className="size-3" aria-hidden />
                      {t("files.internal")}
                    </span>
                  ) : null}
                </span>
              </div>

              {/* Downloads are authorized per request rather than linked
                  directly, so a shared row can never become a shared file. */}
              <Link
                href={`/api/projects/${project.reference}/files/${file.id}`}
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
              >
                <Download className="size-4" aria-hidden />
                <span className="sr-only">{t("files.download")}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Messages
 * ---------------------------------------------------------------------- */

export async function MessagesPanel({ workspace, intlTag }: PanelProps) {
  const t = await getTranslations("workspace");
  const { project, messages, viewer } = workspace;

  return (
    <div className="flex flex-col gap-6">
      <MessageComposer projectId={project.id} reference={project.reference} />

      {messages.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<MessageSquare className="size-6" />}
          title={t("messages.title")}
          description={t("messages.empty")}
        />
      ) : (
        <ol className="flex flex-col gap-5">
          {messages.map((message) => {
            const mine = message.authorUserId === viewer.userId;
            return (
              <li key={message.id} className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-baseline gap-2.5">
                  <span className="text-body-sm font-medium text-primary">
                    {mine ? t("messages.you") : message.authorName}
                  </span>
                  {!mine && message.authorType === "staff" ? (
                    <Badge tone="info">{t("messages.team")}</Badge>
                  ) : null}
                  <time
                    className="text-caption text-tertiary"
                    dateTime={message.createdAt.toISOString()}
                    data-numeric
                  >
                    {formatDate(message.createdAt, intlTag)}
                  </time>
                </div>

                <p className="text-body-sm whitespace-pre-wrap text-secondary">
                  {message.body}
                </p>

                {message.attachments.length > 0 ? (
                  <p className="flex items-center gap-1.5 text-caption text-tertiary">
                    <Paperclip className="size-3.5" aria-hidden />
                    {t("messages.attachments", { count: message.attachments.length })}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Change requests
 * ---------------------------------------------------------------------- */

export async function ChangesPanel({ workspace, intlTag }: PanelProps) {
  const t = await getTranslations("workspace");
  const { project, changeRequests, viewer } = workspace;

  return (
    <div className="flex flex-col gap-6">
      <ChangeRequestForm projectId={project.id} reference={project.reference} />

      {changeRequests.length === 0 ? (
        <EmptyState
          size="sm"
          title={t("changes.title")}
          description={t("changes.empty")}
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {changeRequests.map((change) => (
            <li key={change.id}>
              <Card padding="lg" className="flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-body font-medium text-primary">
                      {change.title}
                    </span>
                    <span className="text-caption text-tertiary" data-numeric>
                      {change.reference} · {formatDate(change.createdAt, intlTag)}
                    </span>
                  </div>
                  <Badge
                    tone={
                      change.status === "approved"
                        ? "success"
                        : change.status === "rejected"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {t(`changes.status.${change.status}`)}
                  </Badge>
                </div>

                <p className="text-body-sm whitespace-pre-wrap text-secondary">
                  {change.description}
                </p>

                <Separator />

                {/* Scope, price and time impact shown together. A change that
                    adds work adds all three, and the customer sees them before
                    accepting -- which is what keeps the fixed price honest. */}
                <div className="flex flex-col gap-2">
                  <p className="text-eyebrow text-tertiary uppercase">
                    {t("changes.impactTitle")}
                  </p>
                  {change.priceImpactMinorUnits === null &&
                  change.additionalDays === null ? (
                    <p className="text-body-sm text-secondary">
                      {t("changes.noImpactYet")}
                    </p>
                  ) : (
                    <ul className="flex flex-wrap gap-4 text-body-sm text-secondary">
                      <li data-numeric>
                        {t("changes.priceImpact")}:{" "}
                        {change.priceImpactMinorUnits
                          ? formatMoney(
                              money(
                                change.priceImpactMinorUnits,
                                change.currency as Currency,
                              ),
                              intlTag,
                            )
                          : t("changes.noExtraCost")}
                      </li>
                      {change.additionalDays ? (
                        <li data-numeric>
                          {t("changes.daysImpact", { days: change.additionalDays })}
                        </li>
                      ) : null}
                    </ul>
                  )}
                  {change.scopeNote ? (
                    <p className="text-body-sm text-secondary">{change.scopeNote}</p>
                  ) : null}
                </div>

                {change.status === "quoted" && viewer.isOwner ? (
                  <ChangeRequestDecision
                    changeRequestId={change.id}
                    reference={project.reference}
                  />
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Approvals
 * ---------------------------------------------------------------------- */

export async function ApprovalsPanel({ workspace, intlTag }: PanelProps) {
  const t = await getTranslations("workspace");
  const { project, approvals, viewer } = workspace;

  if (approvals.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={<CircleDashed className="size-6" />}
        title={t("approvals.title")}
        description={t("approvals.empty")}
      />
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {approvals.map((approval) => (
        <li key={approval.id}>
          <Card padding="lg" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-body font-medium text-primary">
                  {t(`approvals.kind.${approval.kind}`)}
                </span>
                <span className="text-caption text-tertiary" data-numeric>
                  {t("approvals.round", { round: approval.round })}
                  {approval.decidedAt
                    ? ` · ${t("approvals.decidedOn", { date: formatDate(approval.decidedAt, intlTag) })}`
                    : ""}
                </span>
              </div>
              <Badge
                tone={
                  approval.status === "approved"
                    ? "success"
                    : approval.status === "changes_requested"
                      ? "warning"
                      : "neutral"
                }
              >
                {t(`approvals.status.${approval.status}`)}
              </Badge>
            </div>

            {approval.summary ? (
              <p className="text-body-sm text-secondary">{approval.summary}</p>
            ) : null}

            {approval.note ? (
              <p className="text-body-sm text-tertiary">{approval.note}</p>
            ) : null}

            {/* Only the owner decides. Staff approving on a customer's behalf
                would make every approval worthless as evidence. */}
            {approval.status === "pending" && viewer.isOwner ? (
              <ApprovalDecision approvalId={approval.id} reference={project.reference} />
            ) : null}
          </Card>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------
 * Payments
 * ---------------------------------------------------------------------- */

export async function PaymentsPanel({ workspace, intlTag }: PanelProps) {
  const t = await getTranslations("workspace");
  const { order, invoices } = workspace;

  if (!order) {
    return (
      <EmptyState
        size="sm"
        title={t("payments.title")}
        description={t("payments.empty")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card padding="lg" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-eyebrow text-tertiary uppercase">{t("payments.order")}</p>
            <p className="text-body font-medium text-primary" data-numeric>
              {order.number}
            </p>
          </div>
          <p className="text-display-sm text-primary" data-numeric>
            {formatMoney(
              money(order.totalMinorUnits, order.currency as Currency),
              intlTag,
            )}
          </p>
        </div>

        {order.paidAt ? (
          <p className="text-caption text-tertiary" data-numeric>
            {t("payments.paidOn", { date: formatDate(order.paidAt, intlTag) })}
          </p>
        ) : null}

        {order.refundedMinorUnits > 0 ? (
          <p className="text-body-sm text-secondary" data-numeric>
            {t("payments.refunded")}:{" "}
            {formatMoney(
              money(order.refundedMinorUnits, order.currency as Currency),
              intlTag,
            )}
          </p>
        ) : null}

        <Link
          href={`/orders/${order.number}`}
          className={cn(
            buttonVariants({ variant: "secondary", size: "sm" }),
            "self-start",
          )}
        >
          {t("payments.viewOrder")}
        </Link>
      </Card>

      {invoices.map((invoice) => (
        <Card
          key={invoice.id}
          padding="lg"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex flex-col gap-1">
            <p className="text-eyebrow text-tertiary uppercase">
              {t("payments.invoice")}
            </p>
            <p className="text-body-sm text-primary" data-numeric>
              {invoice.number}
            </p>
          </div>
          <Badge tone="success">{t(`changes.status.applied`)}</Badge>
        </Card>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Launch
 * ---------------------------------------------------------------------- */

export async function LaunchPanel({ workspace, intlTag }: PanelProps) {
  const t = await getTranslations("workspace");
  const { project, latestProduction } = workspace;

  const steps = [
    { id: "assets", done: Boolean(project.assetsSubmittedAt) },
    { id: "build", done: Boolean(project.deliveredAt) },
    { id: "approval", done: Boolean(project.approvedAt) },
    { id: "deploy", done: Boolean(project.launchedAt) },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <Card padding="lg" className="flex flex-col gap-5">
        <p className="text-eyebrow text-tertiary uppercase">{t("launch.checklist")}</p>
        <ul className="flex flex-col gap-3">
          {steps.map((step) => (
            <li key={step.id} className="flex items-center gap-2.5">
              {step.done ? (
                <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
              ) : (
                <CircleDashed className="size-4 shrink-0 text-tertiary" aria-hidden />
              )}
              <span
                className={cn(
                  "text-body-sm",
                  step.done ? "text-primary" : "text-tertiary",
                )}
              >
                {t(`launch.steps.${step.id}`)}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {latestProduction?.url ? (
        <Card padding="lg" className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-eyebrow text-tertiary uppercase">
            <Globe className="size-3.5" aria-hidden />
            {t("launch.live")}
          </p>
          <a
            href={latestProduction.url}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(buttonVariants({ variant: "primary" }), "self-start")}
          >
            {latestProduction.url}
            <ArrowUpRight className="rtl-flip size-4" aria-hidden />
          </a>
          {latestProduction.readyAt ? (
            <p className="text-caption text-tertiary" data-numeric>
              {t("preview.deployed", {
                date: formatDate(latestProduction.readyAt, intlTag),
              })}
            </p>
          ) : null}
        </Card>
      ) : (
        <EmptyState
          size="sm"
          icon={<Rocket className="size-6" />}
          title={t("launch.title")}
          description={project.approvedAt ? t("launch.noDomain") : t("launch.notYet")}
        />
      )}
    </div>
  );
}
