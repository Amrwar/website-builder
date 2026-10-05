import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";

import { clerkAppearance } from "@/lib/clerk-appearance";

export const metadata: Metadata = {
  title: "Create an account",
  robots: { index: false, follow: false },
};

/**
 * Registration.
 *
 * Email verification is enforced by Clerk before the session becomes active,
 * so the application never has to reason about half-verified accounts.
 */
export default function SignUpPage() {
  return <SignUp appearance={clerkAppearance} />;
}
