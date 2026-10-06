import type { Metadata } from "next";

import { PlannedSection } from "@/components/admin/planned-section";

export const metadata: Metadata = {
  title: "Referrals",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function ReferralsPage() {
  return <PlannedSection id="referrals" />;
}
