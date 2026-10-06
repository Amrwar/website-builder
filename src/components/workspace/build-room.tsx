"use client";

import type { ReactNode } from "react";

import { useTranslations } from "next-intl";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { WorkspacePanel } from "@/config/workspace";

/**
 * The Build Room shell.
 *
 * A client component only because the tabs are interactive; every panel inside
 * it is a server component passed in as children. That keeps the data fetching,
 * the authorization and the formatting on the server, and ships only the tab
 * behaviour to the browser.
 *
 * Which tabs exist comes from `panels`, which the caller reads from the product
 * type's workspace definition. A maintenance plan renders four tabs and a
 * website renders nine, without this component knowing either exists.
 *
 * Mobile-first: the tab strip scrolls horizontally on a phone rather than
 * wrapping into three cramped rows, and the panels below are a single column
 * until there is room for more.
 */
export function BuildRoom({
  panels,
  children,
  defaultPanel = "overview",
}: {
  panels: readonly WorkspacePanel[];
  children: Partial<Record<WorkspacePanel, ReactNode>>;
  defaultPanel?: WorkspacePanel;
}) {
  const t = useTranslations("workspace");

  const available = panels.filter((panel) => children[panel] !== undefined);
  const initial = available.includes(defaultPanel) ? defaultPanel : available[0];

  if (!initial) return null;

  return (
    <Tabs defaultValue={initial} className="w-full">
      {/* The strip scrolls instead of wrapping; `-mx` lets it bleed to the
          screen edge on a phone so it reads as scrollable. */}
      <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        <TabsList className="w-max min-w-full">
          {available.map((panel) => (
            <TabsTrigger key={panel} value={panel}>
              {t(`tabs.${panel}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {available.map((panel) => (
        <TabsContent key={panel} value={panel} className="pt-6">
          {children[panel]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
