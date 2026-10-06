import type { Metadata } from "next";

import { PlannedSection } from "@/components/admin/planned-section";

export const metadata: Metadata = {
  title: "Domains",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function DomainsPage() {
  return <PlannedSection id="domains" />;
}
