import type { Metadata } from "next";

import { PlannedSection } from "@/components/admin/planned-section";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function NotificationsPage() {
  return <PlannedSection id="notifications" />;
}
