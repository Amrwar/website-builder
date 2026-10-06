import type { Metadata } from "next";

import { PlannedSection } from "@/components/admin/planned-section";

export const metadata: Metadata = {
  title: "Reviews",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function ReviewsPage() {
  return <PlannedSection id="reviews" />;
}
