import {
  ArrowUpRight,
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

import { Numeric } from "@/components/ui/numeric";
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
import { BuildMore, LaunchChecklist } from "@/components/workspace/launch-centre";
import {
  RequestReview,
  ReviewForm,
  ShowcaseConsent,
} from "@/components/growth/review-form";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatMoney, money, type Currency } from "@/lib/pricing/money";
import type { LaunchCentre } from "@/server/launch";
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
  /**
   * The viewer's own zone. Separate from `intlTag` because the two come from
   * different places -- the tag from the URL locale, the zone from the
   * account -- and a timestamp rendered without it silently uses the server's.
   */
  timeZone: string;
}

/**
 * The Launch Centre's own data.
 *
 * Passed in rather than fetched here, because loading it costs several queries
 * and only one of nine panels needs it. Null when the project has not reached
 * a point where any of it is meaningful.
 */
export interface LaunchPanelData extends LaunchCentre {
  /** True when more work can be ordered on this project right now. */
  canExpand: boolean;
  credit: { minutes: number; hours: number; remainder: number };
  /**
   * The post-launch surfaces: reviewing the work, and agreeing to have it
   * shown. Null before launch, because neither means anything until then.
   */
  growth: {
    review: {
      status: string;
      rating: number | null;
      body: string | null;
      published: boolean;
      moderationNote: string | null;
    } | null;
    showcaseConsented: boolean;
    showcasePublished: boolean;
  } | null;
}

interface LaunchPanelProps extends PanelProps {
  launch: LaunchPanelData | null;
}

function formatDate(date: Date, intlTag: string, timeZone: string): string {
  return new Intl.DateTimeFormat(intlTag, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
}

/* -------------------------------------------------------------------------
 * Overview
 * ---------------------------------------------------------------------- */

export async function OverviewPanel({ workspace, intlTag, timeZone }: PanelProps) {
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
            timeZone={timeZone}
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

export async function TimelinePanel({ workspace, intlTag, timeZone }: PanelProps) {
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
                    {formatDate(event.occurredAt, intlTag, timeZone)}
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

export async function PreviewPanel({ workspace, intlTag, timeZone }: PanelProps) {
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
                <p className="text-caption text-tertiary">
                  {t("preview.deployed", {
                    date: formatDate(latestPreview.readyAt, intlTag, timeZone),
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
            <span className="text-body-sm text-secondary">
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

export async function FilesPanel({ workspace, intlTag, timeZone }: PanelProps) {
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
                  <span>{t("files.version", { version: file.version })}</span>
                  <span data-numeric>
                    {formatDate(file.createdAt, intlTag, timeZone)}
                  </span>
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

export async function MessagesPanel({ workspace, intlTag, timeZone }: PanelProps) {
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
                    {formatDate(message.createdAt, intlTag, timeZone)}
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

export async function ChangesPanel({ workspace, intlTag, timeZone }: PanelProps) {
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
                    <span className="text-caption text-tertiary">
                      <Numeric>{change.reference}</Numeric> ·{" "}
                      <Numeric>{formatDate(change.createdAt, intlTag, timeZone)}</Numeric>
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
                      <li>
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
                        <li>
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

export async function ApprovalsPanel({ workspace, intlTag, timeZone }: PanelProps) {
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
                <span className="text-caption text-tertiary">
                  {t("approvals.round", { round: approval.round })}
                  {approval.decidedAt ? (
                    <>
                      {" · "}
                      {t("approvals.decidedOn", {
                        date: formatDate(approval.decidedAt, intlTag, timeZone),
                      })}
                    </>
                  ) : null}
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

export async function PaymentsPanel({ workspace, intlTag, timeZone }: PanelProps) {
  const t = await getTranslations("workspace");
  const tInvoice = await getTranslations("invoice");
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
          <p className="text-caption text-tertiary">
            {t("payments.paidOn", { date: formatDate(order.paidAt, intlTag, timeZone) })}
          </p>
        ) : null}

        {order.refundedMinorUnits > 0 ? (
          <p className="text-body-sm text-secondary">
            {t("payments.refunded")}:{" "}
            <Numeric>
              {formatMoney(
                money(order.refundedMinorUnits, order.currency as Currency),
                intlTag,
              )}
            </Numeric>
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
            <p className="text-body-sm text-primary">
              <Numeric>{invoice.number}</Numeric>
            </p>
          </div>
          <Link
            href={`/invoices/${invoice.number}`}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            {tInvoice("view")}
          </Link>
        </Card>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Launch
 * ---------------------------------------------------------------------- */

/**
 * The Launch Centre.
 *
 * Replaces the four hard-coded steps this panel used to render. What a launch
 * requires is configuration now, so this shows whatever the checklist holds,
 * grouped and explained, alongside the facts a launch actually depends on: the
 * deployment the hosting provider confirmed, the domain, DNS, the certificate
 * and hosting itself.
 *
 * Nothing here concludes anything. Readiness was computed on the server from
 * recorded observations, and the Go live button only submits -- the refusal
 * lives in `launchProject`, which re-derives everything before writing.
 */
export async function LaunchPanel({
  workspace,
  intlTag,
  timeZone,
  launch,
}: LaunchPanelProps) {
  const t = await getTranslations("workspace.launch");
  const { project, viewer } = workspace;

  if (!launch) {
    return (
      <EmptyState
        size="sm"
        icon={<Rocket className="size-6" />}
        title={t("title")}
        description={t("notYet")}
      />
    );
  }

  const { readiness, checklist, production, history, hosting, primary } = launch;

  return (
    <div className="flex flex-col gap-6">
      {project.launchedAt ? (
        <Callout
          tone="success"
          title={t("launched", {
            date: formatDate(project.launchedAt, intlTag, timeZone),
          })}
        />
      ) : null}

      {launch.certificateWarning ? (
        <Callout
          tone={launch.certificateWarning.expired ? "danger" : "warning"}
          title={
            launch.certificateWarning.expired
              ? t("certificateExpired")
              : t("certificateExpiring", {
                  days: launch.certificateWarning.daysRemaining,
                })
          }
        />
      ) : null}

      <Card padding="lg">
        <LaunchChecklist
          projectId={project.id}
          rows={checklist.map((entry) => ({
            key: entry.item.key,
            group: entry.item.group,
            translationKey: entry.item.translationKey,
            isRequired: entry.item.isRequired,
            state: entry.state,
            note: entry.note,
          }))}
          canEdit={viewer.canExecuteBuild}
          readiness={{
            completed: readiness.completed,
            required: readiness.required,
            percent: readiness.percent,
            ready: readiness.ready,
          }}
          blockers={readiness.blockers.map((blocker) => blocker.code)}
          canLaunch={viewer.canExecuteBuild}
        />
      </Card>

      {/* --- What is live ------------------------------------------------- */}
      {production?.url ? (
        <Card padding="lg" className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-eyebrow text-tertiary uppercase">
            <Globe className="size-3.5" aria-hidden />
            {t("live")}
          </p>
          <a
            href={production.url}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(buttonVariants({ variant: "primary" }), "self-start")}
          >
            {production.url}
            <ArrowUpRight className="rtl-flip size-4" aria-hidden />
          </a>
          {production.providerConfirmedAt ? (
            <p className="text-caption text-tertiary">
              {t("deployment")} ·{" "}
              <Numeric>
                {formatDate(production.providerConfirmedAt, intlTag, timeZone)}
              </Numeric>
            </p>
          ) : null}
        </Card>
      ) : null}

      {/* --- Domain -------------------------------------------------------- */}
      <Card padding="lg" className="flex flex-col gap-3">
        <p className="text-eyebrow text-tertiary uppercase">{t("domain")}</p>

        {primary ? (
          <div className="flex flex-col gap-2">
            <p className="text-body-sm text-primary" data-numeric>
              {primary.name}
            </p>
            {/* Three badges rather than one status: verification, DNS and the
                certificate fail for different reasons and are fixed
                differently, and a customer has to see which one they have. */}
            <div className="flex flex-wrap gap-2">
              <Badge tone={primary.verification === "verified" ? "success" : "neutral"}>
                {t(`domainState.verification.${primary.verification}`)}
              </Badge>
              <Badge tone={primary.dnsState === "configured" ? "success" : "neutral"}>
                {t(`domainState.dns.${primary.dnsState}`)}
              </Badge>
              <Badge tone={primary.sslState === "issued" ? "success" : "neutral"}>
                {t(`domainState.ssl.${primary.sslState}`)}
              </Badge>
            </div>
          </div>
        ) : (
          <p className="text-body-sm text-secondary">{t("noDomain")}</p>
        )}
      </Card>

      {/* --- Hosting ------------------------------------------------------- */}
      <Card padding="lg" className="flex flex-col gap-3">
        <p className="text-eyebrow text-tertiary uppercase">{t("hosting.title")}</p>

        {hosting ? (
          <div className="flex flex-col items-start gap-2">
            <Badge tone={hosting.status === "active" ? "success" : "neutral"}>
              {t(`hosting.status.${hosting.status}`)}
            </Badge>
            {/* An uptime figure is only shown with the moment it was measured.
                A percentage with no "as of" is a number nobody should act on. */}
            {hosting.uptimeBasisPoints !== null && hosting.uptimeCheckedAt ? (
              <p className="text-caption text-secondary">
                {t("hosting.uptime", {
                  value: (hosting.uptimeBasisPoints / 100).toFixed(2),
                })}{" "}
                ·{" "}
                {t("hosting.uptimeAsOf", {
                  date: formatDate(hosting.uptimeCheckedAt, intlTag, timeZone),
                })}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-body-sm text-secondary">{t("hosting.none")}</p>
        )}
      </Card>

      {/* --- History ------------------------------------------------------- */}
      <Card padding="lg" className="flex flex-col gap-3">
        <p className="text-eyebrow text-tertiary uppercase">{t("history")}</p>

        {history.length === 0 ? (
          <p className="text-body-sm text-secondary">{t("noHistory")}</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {history.map((deployment) => (
              <li
                key={deployment.id}
                className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line-subtle pb-2.5 last:border-0 last:pb-0"
              >
                <span className="flex items-center gap-2">
                  <span className="text-body-sm text-primary" data-numeric>
                    {deployment.version}
                  </span>
                  <span className="text-caption text-tertiary">
                    {deployment.environment}
                  </span>
                </span>

                <span className="flex items-center gap-2">
                  {/* Only a provider-confirmed deployment reads as live. One
                      still building says so rather than implying success. */}
                  <Badge tone={deployment.state === "ready" ? "success" : "neutral"}>
                    {t(`deploymentState.${deployment.state}`)}
                  </Badge>
                  <span className="text-caption text-tertiary">
                    {deployment.providerConfirmedAt ? (
                      <Numeric>
                        {formatDate(deployment.providerConfirmedAt, intlTag, timeZone)}
                      </Numeric>
                    ) : (
                      t("awaitingProvider")
                    )}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* --- After it is live --------------------------------------------- */}
      {launch.growth ? (
        <div className="flex flex-col gap-4 border-t border-line-subtle pt-6">
          {/* The customer writes a review; staff ask for one. Two halves of
              the same thing, shown to whichever party can act. */}
          {viewer.isOwner ? (
            <ReviewForm
              projectId={project.id}
              existing={launch.growth.review}
              canReview={project.launchedAt !== null}
            />
          ) : viewer.canExecuteBuild ? (
            <RequestReview
              projectId={project.id}
              launched={project.launchedAt !== null}
              existingStatus={launch.growth.review?.status ?? null}
            />
          ) : null}
          {viewer.isOwner ? (
            <ShowcaseConsent
              projectId={project.id}
              consented={launch.growth.showcaseConsented}
              published={launch.growth.showcasePublished}
              canConsent={project.launchedAt !== null}
            />
          ) : null}
        </div>
      ) : null}

      <BuildMore
        projectId={project.id}
        available={launch.canExpand}
        creditHours={launch.credit.hours}
        creditMinutes={launch.credit.remainder}
      />
    </div>
  );
}
