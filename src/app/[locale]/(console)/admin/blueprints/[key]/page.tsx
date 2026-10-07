import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import {
  BlueprintEditor,
  BlueprintStatusToggle,
  PublishVersion,
} from "@/components/admin/business/blueprint-admin";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableMessageRow,
  TableRow,
} from "@/components/ui/table";
import {
  BUSINESS_FEATURES,
  isShippedBlueprintKey,
  type BusinessFeatureId,
  type FeatureKind,
} from "@/config/business";
import { getLocaleDefinition, LOCALES, resolveLocale } from "@/config/locales";
import { BUILD_TYPES } from "@/config/products";
import { Link } from "@/i18n/navigation";
import type { BlueprintCopySet, BlueprintDefinition } from "@/lib/business/blueprint";
import { formatMoney } from "@/lib/pricing/money";
import { requireAdminSection } from "@/server/admin/guard";
import { loadBusinessCatalog, readBlueprintForAdmin } from "@/server/business/blueprints";
import { estimateBlueprint, type BlueprintEstimate } from "@/server/business/preview";
import { blueprintCopy, categoryName } from "@/server/business/public";
import { viewerDates } from "@/server/i18n";

export const metadata: Metadata = {
  title: "Blueprint",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * One blueprint: its versions, what each is quoted, and -- for the owner --
 * the editor that writes the next one.
 *
 * Saving never edits a version. It writes a new one, and the history below
 * is the database's append-only record of every definition a customer could
 * have been shown.
 */
export default async function AdminBlueprintPage({
  params,
}: PageProps<"/[locale]/admin/blueprints/[key]">) {
  const context = await requireAdminSection("blueprints");
  const { locale: rawLocale, key } = await params;
  const locale = resolveLocale(rawLocale);
  const { intlTag } = getLocaleDefinition(locale);

  const detail = await readBlueprintForAdmin(key, context);
  if (!detail) notFound();

  const [t, tCopy, tKind, tProduct, catalog, dates] = await Promise.all([
    getTranslations("adminConsole.blueprintsPage"),
    getTranslations("blueprints"),
    getTranslations("startBusiness.recommend.kind"),
    getTranslations("home.products"),
    loadBusinessCatalog(),
    viewerDates(rawLocale),
  ]);
  const canEdit = context.can("settings:manage");
  const isShipped = isShippedBlueprintKey(detail.key);

  const live = catalog.blueprints.find((entry) => entry.key === detail.key) ?? null;
  const [liveEstimate, workingEstimate] = await Promise.all([
    live ? estimateBlueprint(detail.key, live.definition, locale) : null,
    estimateBlueprint(detail.key, detail.working, locale),
  ]);

  // The catalogue wording in every language, as the starting point for an
  // administrator who wants to reword a shipped blueprint.
  const catalogueCopy: BlueprintCopySet | null = isShipped
    ? (Object.fromEntries(
        await Promise.all(
          LOCALES.map(async (code) => {
            const tl = await getTranslations({ locale: code, namespace: "blueprints" });
            return [
              code,
              blueprintCopy(detail.key, { ...detail.working, copy: null }, code, tl),
            ];
          }),
        ),
      ) as BlueprintCopySet)
    : null;

  const title =
    blueprintCopy(detail.key, detail.working, locale, tCopy)?.name ?? detail.key;

  const describe = (estimate: BlueprintEstimate | null) =>
    !estimate
      ? t("preview.unavailable")
      : estimate.quote || !estimate.total
        ? t("preview.quote")
        : `${formatMoney(estimate.total, intlTag, { trimWholeDecimals: true })} · ${
            estimate.days === null ? "" : t("preview.days", { days: estimate.days })
          }`;

  const kindLabels: Record<FeatureKind, string> = {
    page: tKind("page"),
    feature: tKind("feature"),
    workflow: tKind("workflow"),
  };
  const featureName = (id: string) => tCopy(`features.${id as BusinessFeatureId}.name`);

  return (
    <AdminShell role={context.user.role} active="blueprints">
      <Link
        href="/admin/blueprints"
        className="mb-4 inline-block text-body-sm text-accent hover:underline"
      >
        {t("editor.back")}
      </Link>
      <AdminPageHeader
        title={title}
        subtitle={detail.key}
        actions={
          canEdit && (isShipped || detail.versions.length > 0) ? (
            <BlueprintStatusToggle blueprintKey={detail.key} status={detail.status} />
          ) : undefined
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge tone={detail.status === "active" ? "success" : "neutral"}>
          {t(detail.status)}
        </Badge>
        <Badge tone="neutral">
          {detail.publishedVersion
            ? t("editor.live", { version: detail.publishedVersion })
            : isShipped
              ? t("editor.liveShipped")
              : t("editor.notLive")}
        </Badge>
      </div>

      <div className="mb-6 flex flex-col gap-3">
        {detail.status === "archived" ? (
          <Callout tone="warning">{t("editor.archivedNote")}</Callout>
        ) : null}
        {!canEdit ? <Callout tone="info" title={t("readOnly")} /> : null}
      </div>

      <Card padding="lg" className="mb-8 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-display-xs text-primary">{t("preview.title")}</h2>
          <p className="text-body-sm text-secondary">{t("preview.body")}</p>
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-0.5">
            <dt className="text-caption text-tertiary">{t("preview.live")}</dt>
            <dd className="text-body text-primary tabular-nums">
              {describe(liveEstimate)}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-caption text-tertiary">{t("preview.working")}</dt>
            <dd className="text-body text-primary tabular-nums">
              {describe(workingEstimate)}
            </dd>
          </div>
        </dl>
      </Card>

      <section className="mb-10 flex flex-col gap-4">
        <p className="text-caption text-tertiary">
          {t("editor.workingFrom", {
            version:
              detail.workingVersion === 0
                ? t("editor.shippedVersion")
                : t("versionLabel", { version: detail.workingVersion }),
          })}
        </p>
        {canEdit ? (
          <BlueprintEditor
            blueprintKey={detail.key}
            working={detail.working}
            isShipped={isShipped}
            catalogueCopy={catalogueCopy}
            categories={catalog.categories.map((category) => ({
              value: category.key,
              label: categoryName(category, locale, tCopy),
            }))}
            products={BUILD_TYPES.map((type) => ({
              value: type,
              label: tProduct(`${type}.name`),
            }))}
            features={BUSINESS_FEATURES.map((feature) => ({
              id: feature.id,
              kind: feature.kind,
              name: featureName(feature.id),
            }))}
            kindLabels={kindLabels}
          />
        ) : (
          <ReadOnlyDefinition
            definition={detail.working}
            featureName={featureName}
            labels={{
              recommended: t("editor.levels.recommended"),
              optional: t("editor.levels.optional"),
            }}
          />
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-display-xs text-primary">{t("versions.title")}</h2>
        <Table label={t("versions.title")}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("versions.version")}</TableHead>
              <TableHead>{t("versions.author")}</TableHead>
              <TableHead>{t("versions.created")}</TableHead>
              <TableHead>{t("versions.published")}</TableHead>
              <TableHead>{t("versions.note")}</TableHead>
              <TableHead>
                <span className="sr-only">{t("table.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.versions.length === 0 ? (
              <TableMessageRow colSpan={6}>{t("versions.empty")}</TableMessageRow>
            ) : (
              detail.versions.map((version) => {
                const isLive = version.version === detail.publishedVersion;
                return (
                  <TableRow key={version.version}>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {t("versionLabel", { version: version.version })}
                        {isLive ? (
                          <Badge tone="success">{t("versions.live")}</Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell>{version.authorEmail ?? "—"}</TableCell>
                    <TableCell>{dates.dateTime(version.createdAt)}</TableCell>
                    <TableCell>
                      {version.publishedAt
                        ? dates.dateTime(version.publishedAt)
                        : t("versions.never")}
                    </TableCell>
                    <TableCell className="max-w-72">{version.note ?? "—"}</TableCell>
                    <TableCell>
                      {canEdit && !isLive && version.definition ? (
                        <PublishVersion
                          blueprintKey={detail.key}
                          version={version.version}
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </section>
    </AdminShell>
  );
}

function ReadOnlyDefinition({
  definition,
  featureName,
  labels,
}: {
  definition: BlueprintDefinition;
  featureName: (id: string) => string;
  labels: { recommended: string; optional: string };
}) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {(["recommended", "optional"] as const).map((level) => (
        <div key={level} className="flex flex-col gap-2">
          <h3 className="text-eyebrow text-tertiary uppercase">{labels[level]}</h3>
          <ul className="flex flex-col gap-1 text-body-sm text-primary">
            {definition[level].map((id) => (
              <li key={id}>{featureName(id)}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
