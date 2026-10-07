import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import {
  CategoryControls,
  CreateBlueprint,
  CreateCategory,
} from "@/components/admin/business/blueprint-admin";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { BUILD_TYPES } from "@/config/products";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/pricing/money";
import { requireAdminSection } from "@/server/admin/guard";
import { readBlueprintsForAdmin } from "@/server/business/blueprints";
import { estimateBlueprint } from "@/server/business/preview";
import { blueprintCopy, categoryName } from "@/server/business/public";

export const metadata: Metadata = {
  title: "Blueprints",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Business-in-a-Box blueprints.
 *
 * Every figure on this page comes from the engine, through the same
 * `assessAndPrice` a customer's estimate does. There is no blueprint price
 * column to edit, on purpose: a blueprint is a list of recommendations, and
 * what those cost is the pricing catalogue's answer, edited there.
 */
export default async function AdminBlueprintsPage({
  params,
}: PageProps<"/[locale]/admin/blueprints">) {
  const context = await requireAdminSection("blueprints");
  const locale = resolveLocale((await params).locale);
  const { intlTag } = getLocaleDefinition(locale);

  const [t, tCopy, tProduct, data] = await Promise.all([
    getTranslations("adminConsole.blueprintsPage"),
    getTranslations("blueprints"),
    getTranslations("home.products"),
    readBlueprintsForAdmin(context),
  ]);
  const canEdit = context.can("settings:manage");

  const estimates = await Promise.all(
    data.blueprints.map((blueprint) =>
      estimateBlueprint(blueprint.key, blueprint.definition, locale),
    ),
  );

  const categoryLabel = new Map(
    data.catalog.categories.map((category) => [
      category.key,
      categoryName(category, locale, tCopy),
    ]),
  );
  const categoryOptions = data.catalog.categories.map((category) => ({
    value: category.key,
    label: categoryLabel.get(category.key) ?? category.key,
  }));
  const productOptions = BUILD_TYPES.map((type) => ({
    value: type,
    label: tProduct(`${type}.name`),
  }));

  return (
    <AdminShell role={context.user.role} active="blueprints">
      <AdminPageHeader title={t("title")} subtitle={t("description")} />

      <div className="mb-6 flex flex-col gap-3">
        {!canEdit ? <Callout tone="info" title={t("readOnly")} /> : null}
        <Callout
          tone="neutral"
          title={t("pricingNote.title")}
          action={
            context.can("finance:read") ? (
              <Link
                href="/admin/pricing"
                className="text-body-sm font-medium text-accent hover:underline"
              >
                {t("pricingNote.link")}
              </Link>
            ) : undefined
          }
        >
          {t("pricingNote.body")}
        </Callout>
      </div>

      <Table label={t("title")}>
        <TableHeader>
          <TableRow>
            <TableHead>{t("table.name")}</TableHead>
            <TableHead>{t("table.category")}</TableHead>
            <TableHead>{t("table.product")}</TableHead>
            <TableHead>{t("table.version")}</TableHead>
            <TableHead>{t("table.status")}</TableHead>
            <TableHead numeric>{t("table.recommended")}</TableHead>
            <TableHead numeric>{t("table.estimate")}</TableHead>
            <TableHead numeric>{t("table.orders")}</TableHead>
            <TableHead>
              <span className="sr-only">{t("table.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.blueprints.map((blueprint, index) => {
            const copy = blueprintCopy(
              blueprint.key,
              blueprint.definition,
              locale,
              tCopy,
            );
            const estimate = estimates[index];
            return (
              <TableRow key={blueprint.key}>
                <TableCell>
                  <span className="flex flex-col">
                    <span className="text-primary">{copy?.name ?? blueprint.key}</span>
                    <span className="font-mono text-caption text-tertiary">
                      {blueprint.key}
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  {categoryLabel.get(blueprint.definition.categoryKey) ??
                    blueprint.definition.categoryKey}
                </TableCell>
                <TableCell>
                  {tProduct(`${blueprint.definition.buildType}.name`)}
                </TableCell>
                <TableCell>
                  {blueprint.version === 0
                    ? t("shipped")
                    : t("versionLabel", { version: blueprint.version })}
                </TableCell>
                <TableCell>
                  <span className="flex flex-wrap gap-1.5">
                    <Badge tone={blueprint.status === "active" ? "success" : "neutral"}>
                      {t(blueprint.status)}
                    </Badge>
                    {blueprint.hasUnpublished ? (
                      <Badge tone="warning">{t("unpublished")}</Badge>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell numeric>{blueprint.definition.recommended.length}</TableCell>
                <TableCell numeric>
                  {!estimate
                    ? "—"
                    : estimate.quote || !estimate.total
                      ? t("quote")
                      : formatMoney(estimate.total, intlTag, { trimWholeDecimals: true })}
                </TableCell>
                <TableCell numeric>{blueprint.paidOrders}</TableCell>
                <TableCell>
                  <Link
                    href={`/admin/blueprints/${blueprint.key}`}
                    className="text-body-sm font-medium text-accent hover:underline"
                  >
                    {t("open")}
                    <span className="sr-only"> {copy?.name ?? blueprint.key}</span>
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {data.drafts.length > 0 ? (
        <section className="mt-8 flex flex-col gap-2">
          <h2 className="text-display-xs text-primary">{t("drafts.title")}</h2>
          <p className="text-body-sm text-secondary">{t("drafts.body")}</p>
          <ul className="flex flex-wrap gap-3">
            {data.drafts.map((key) => (
              <li key={key}>
                <Link
                  href={`/admin/blueprints/${key}`}
                  className="font-mono text-body-sm text-accent hover:underline"
                >
                  {key}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canEdit ? (
        <div className="mt-8">
          <CreateBlueprint categories={categoryOptions} products={productOptions} />
        </div>
      ) : null}

      <section className="mt-10 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-display-xs text-primary">{t("categories.title")}</h2>
          <p className="text-body-sm text-secondary">{t("categories.body")}</p>
        </div>
        <Table label={t("categories.title")}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("categories.name")}</TableHead>
              <TableHead>{t("categories.key")}</TableHead>
              <TableHead>
                {canEdit ? t("categories.save") : t("categories.shown")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.catalog.categories.map((category) => (
              <TableRow key={category.key}>
                <TableCell>
                  <span className="flex flex-col">
                    <span className="text-primary">
                      {categoryLabel.get(category.key)}
                    </span>
                    {category.source === "shipped" && !category.names ? (
                      <span className="text-caption text-tertiary">
                        {t("categories.fromCatalogue")}
                      </span>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-caption">{category.key}</TableCell>
                <TableCell>
                  {canEdit ? (
                    <CategoryControls
                      categoryKey={category.key}
                      sortOrder={category.sortOrder}
                      isActive={category.isActive}
                    />
                  ) : (
                    <Badge tone={category.isActive ? "success" : "neutral"}>
                      {category.isActive ? t("active") : t("archived")}
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {canEdit ? <CreateCategory /> : null}
      </section>
    </AdminShell>
  );
}
