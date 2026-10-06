import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { viewerDates } from "@/server/i18n";
import { getAuthContext } from "@/server/auth";
import { listProjectsForCaller } from "@/server/workspace/queries";

export const metadata: Metadata = {
  title: "Your builds",
  robots: { index: false, follow: false },
};

/**
 * The list of a customer's builds.
 *
 * Scoped in the query: a customer sees their own, staff with `project:read:all`
 * see everything. There is no "all projects" toggle that a customer could flip.
 */
export default async function ProjectsPage({ params }: PageProps<"/[locale]/projects">) {
  const context = await getAuthContext();
  if (!context) redirect("/sign-in");

  const { locale } = await params;
  const t = await getTranslations("workspace");
  const dates = await viewerDates(locale);

  const projects = await listProjectsForCaller(context);

  return (
    <Container width="content" className="py-12 sm:py-16">
      <header className="mb-10 flex flex-col gap-3">
        <h1 className="text-display-lg text-primary">{t("list.title")}</h1>
        <p className="max-w-2xl text-body-lg text-secondary">{t("list.subtitle")}</p>
      </header>

      {projects.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid className="size-6" />}
          title={t("list.empty.title")}
          description={t("list.empty.body")}
          action={
            <Link href="/configure" className={buttonVariants({ variant: "primary" })}>
              {t("list.empty.cta")}
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {projects.map((project) => (
            <li key={project.id}>
              <Link href={`/projects/${project.reference}`} className="block">
                <Card
                  padding="lg"
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-4",
                    "duration-fast transition-colors ease-out-quint hover:bg-hover",
                  )}
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-body font-medium text-primary" data-numeric>
                      {project.reference}
                    </span>
                    <span className="text-caption text-tertiary" data-numeric>
                      {dates.date(project.createdAt)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {project.deadlineAt ? (
                      <span className="text-caption text-secondary" data-numeric>
                        {t("deadline.due", {
                          date: dates.date(project.deadlineAt),
                        })}
                      </span>
                    ) : null}
                    <Badge tone={project.status === "launched" ? "success" : "info"}>
                      {t(`status.${project.status}`)}
                    </Badge>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
