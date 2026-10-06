import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Container } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { BuildRoom } from "@/components/workspace/build-room";
import {
  ApprovalsPanel,
  ChangesPanel,
  FilesPanel,
  LaunchPanel,
  MessagesPanel,
  OverviewPanel,
  PaymentsPanel,
  PreviewPanel,
  TimelinePanel,
} from "@/components/workspace/panels";
import { getLocaleDefinition, resolveLocale } from "@/config/locales";
import { Link } from "@/i18n/navigation";
import { getAuthContext } from "@/server/auth";
import { getWorkspace } from "@/server/workspace/queries";

export const metadata: Metadata = {
  title: "Build room",
  robots: { index: false, follow: false },
};

/**
 * The Build Room.
 *
 * Everything is loaded once, server-side, by `getWorkspace`, which applies the
 * authorization. The panels are passed into a client shell as children, so the
 * only JavaScript this page ships is the tab behaviour and the handful of
 * forms.
 *
 * Which panels render comes from the product type's workspace definition.
 * Nothing here knows what a website is.
 */
export default async function BuildRoomPage({
  params,
}: PageProps<"/[locale]/projects/[reference]">) {
  const context = await getAuthContext();
  if (!context) redirect("/sign-in");

  const { locale, reference } = await params;
  const workspace = await getWorkspace(reference, context);

  const t = await getTranslations("workspace");
  const { intlTag } = getLocaleDefinition(resolveLocale(locale));
  const { project, definition } = workspace;

  const panelContent = {
    overview: <OverviewPanel workspace={workspace} intlTag={intlTag} />,
    timeline: <TimelinePanel workspace={workspace} intlTag={intlTag} />,
    preview: <PreviewPanel workspace={workspace} intlTag={intlTag} />,
    files: <FilesPanel workspace={workspace} intlTag={intlTag} />,
    messages: <MessagesPanel workspace={workspace} intlTag={intlTag} />,
    changes: <ChangesPanel workspace={workspace} intlTag={intlTag} />,
    approvals: <ApprovalsPanel workspace={workspace} intlTag={intlTag} />,
    payments: <PaymentsPanel workspace={workspace} intlTag={intlTag} />,
    launch: <LaunchPanel workspace={workspace} intlTag={intlTag} />,
  };

  // Only the panels this product actually uses are handed to the shell.
  const children = Object.fromEntries(
    definition.panels.map((panel) => [panel, panelContent[panel]]),
  );

  return (
    <Container width="content" className="py-10 sm:py-14">
      <header className="mb-8 flex flex-col gap-4">
        <Link
          href="/projects"
          className="inline-flex w-fit items-center gap-1.5 text-body-sm text-secondary hover:text-primary"
        >
          <ArrowLeft className="rtl-flip size-4" aria-hidden />
          {t("back")}
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-display-lg text-primary" data-numeric>
            {project.reference}
          </h1>
          <Badge tone={project.status === "launched" ? "success" : "info"}>
            {t(`status.${project.status}`)}
          </Badge>
          {workspace.unreadCount > 0 ? (
            <Badge tone="warning">
              {t("messages.unread", { count: workspace.unreadCount })}
            </Badge>
          ) : null}
        </div>
      </header>

      <BuildRoom panels={definition.panels}>{children}</BuildRoom>
    </Container>
  );
}
