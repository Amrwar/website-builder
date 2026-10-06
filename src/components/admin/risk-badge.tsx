import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import type { RiskLevel } from "@/lib/production/risk";

/**
 * Schedule risk, as a badge.
 *
 * The level comes from `assessRisk`, which derives it from task state and the
 * clock -- it is never set by hand, and the reasons behind it travel with it
 * on the project page. Red here always means something specific happened.
 */
export async function RiskBadge({ level }: { level: RiskLevel }) {
  const t = await getTranslations("adminConsole.risk");

  const tone = level === "red" ? "danger" : level === "yellow" ? "warning" : "success";

  return <Badge tone={tone}>{t(level)}</Badge>;
}
