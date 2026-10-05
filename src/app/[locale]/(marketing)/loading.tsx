import { getTranslations } from "next-intl/server";

import { PageSkeleton } from "@/components/ui/page-skeleton";

/**
 * Shown while a marketing route streams.
 *
 * Present even though the home page is statically prerendered: it covers
 * client-side navigations into this group and any future route here that does
 * fetch data, so a slow segment never shows a blank frame.
 */
export default async function MarketingLoading() {
  const t = await getTranslations("common");
  return <PageSkeleton label={t("loading")} />;
}
