import type { ReactNode } from "react";

import { getTranslations } from "next-intl/server";

import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";
import { AdminSearch } from "@/components/admin/admin-search";
import { Badge } from "@/components/ui/badge";
import { groupedSectionsFor, type AdminSectionId } from "@/config/admin-nav";
import type { UserRole } from "@/config/roles";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/**
 * The console chrome.
 *
 * A production floor rather than a dashboard template: a dense, quiet sidebar
 * grouped by what someone is actually doing -- operating, commerce, people,
 * platform -- and no decoration competing with the data.
 *
 * The sidebar is built from `groupedSectionsFor(role)`, so what a person sees
 * is a function of their role and nothing else. It is navigation, not
 * security: every page re-checks server-side regardless of what is rendered
 * here.
 */
export async function AdminShell({
  role,
  active,
  children,
}: {
  role: UserRole;
  active: AdminSectionId;
  children: ReactNode;
}) {
  const t = await getTranslations("adminConsole");
  const groups = groupedSectionsFor(role);

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* --- Sidebar, from `lg` up --------------------------------------- */}
      <aside className="hidden w-60 shrink-0 border-e border-line-subtle lg:block">
        <div className="sticky top-0 flex h-dvh flex-col gap-6 overflow-y-auto px-4 py-6">
          <div className="flex flex-col gap-1 px-2">
            <span className="text-body-sm font-semibold text-primary">{t("title")}</span>
            <span className="text-caption text-tertiary">
              {t("signedInAs", { role: t(`roleNames.${role}` as "roleNames.owner") })}
            </span>
          </div>

          <nav aria-label={t("title")} className="flex flex-col gap-5">
            {groups.map(({ group, sections }) => (
              <div key={group} className="flex flex-col gap-1">
                <p className="px-2 text-eyebrow text-tertiary uppercase">
                  {t(`groups.${group}`)}
                </p>
                <ul className="flex flex-col">
                  {sections.map((section) => (
                    <li key={section.id}>
                      <Link
                        href={`/admin${section.path}`}
                        aria-current={section.id === active ? "page" : undefined}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-md px-2 py-1.5",
                          "text-body-sm",
                          "duration-fast transition-colors ease-out-quint",
                          section.id === active
                            ? "bg-hover font-medium text-primary"
                            : "text-secondary hover:bg-hover hover:text-primary",
                        )}
                      >
                        {t(`sections.${section.id as "dashboard"}`)}
                        {section.status === "planned" ? (
                          <span
                            aria-hidden
                            className="size-1.5 shrink-0 rounded-full bg-line-strong"
                          />
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-line-subtle bg-canvas">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <AdminMobileNav role={role} active={active} />
            <AdminSearch />
            <Badge tone="neutral" className="ms-auto hidden sm:inline-flex">
              {t(`roleNames.${role}` as "roleNames.owner")}
            </Badge>
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

/** Page heading used by every console screen, so they line up. */
export function AdminPageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-display-sm text-primary">{title}</h1>
        {subtitle ? (
          <p className="max-w-2xl text-body-sm text-secondary">{subtitle}</p>
        ) : null}
      </div>
      {actions}
    </header>
  );
}
