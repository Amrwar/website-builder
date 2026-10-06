import type { Metadata } from "next";

import { PlannedSection } from "@/components/admin/planned-section";

export const metadata: Metadata = {
  title: "Organizations",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function OrganizationsPage() {
  return <PlannedSection id="organizations" />;
}
