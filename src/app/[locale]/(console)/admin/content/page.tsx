import type { Metadata } from "next";

import { PlannedSection } from "@/components/admin/planned-section";

export const metadata: Metadata = {
  title: "Content",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function ContentPage() {
  return <PlannedSection id="content" />;
}
