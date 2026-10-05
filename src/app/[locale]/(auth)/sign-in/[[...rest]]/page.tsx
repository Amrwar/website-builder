import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";

import { clerkAppearance } from "@/lib/clerk-appearance";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

/**
 * Sign-in.
 *
 * Clerk's hosted component rather than a hand-built form. Registration, login,
 * password reset, email verification, rate limiting, breach-password checks
 * and bot defence all live behind it. Re-implementing that surface is how
 * authentication bugs get written, and none of it is differentiating work.
 *
 * The optional catch-all segment is required: Clerk routes its own sub-steps
 * (verification, factor selection, reset) underneath this path.
 */
export default function SignInPage() {
  return <SignIn appearance={clerkAppearance} />;
}
