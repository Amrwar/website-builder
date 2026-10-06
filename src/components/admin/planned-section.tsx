import { Construction } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { adminSection, type AdminSectionId } from "@/config/admin-nav";
import { requireAdminSection } from "@/server/admin/guard";

/**
 * A section that is declared but not built.
 *
 * Several sections the brief asks for describe data the platform does not hold
 * yet: there are no domains, no hosting records, no partners, no CMS. Rendering
 * an empty table for those would say "nobody has added a domain" when the truth
 * is "domains do not exist here".
 *
 * So the navigation is complete -- the information architecture is real and
 * role-filtered -- and the page is honest about why it has nothing in it, and
 * names the phase that delivers it.
 */
export async function PlannedSection({ id }: { id: AdminSectionId }) {
  const context = await requireAdminSection(id);
  const t = await getTranslations("adminConsole");

  const section = adminSection(id);
  const phase = section?.plannedFor ?? 0;

  return (
    <AdminShell role={context.user.role} active={id}>
      <AdminPageHeader title={t(`sections.${id as "domains"}`)} />

      <EmptyState
        icon={<Construction className="size-6" />}
        title={t("planned.title")}
        description={t("planned.body", { phase })}
      />

      <div className="mx-auto mt-6 max-w-xl">
        <Callout tone="info" title={t("planned.note")} />
      </div>
    </AdminShell>
  );
}
