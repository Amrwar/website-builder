"use client";

import { useEffect, useRef } from "react";

import { claimReferral } from "@/server/growth/claim";

/**
 * Attaches a new account to the link it arrived through.
 *
 * Rendered only when the referral cookie is actually present, so the ordinary
 * case costs nothing. It renders no markup and shows nothing: a customer who
 * was referred does not need to be told the mechanics worked, and one whose
 * referral was refused by the anti-abuse rules should not be told which rule
 * fired — that is a map for the next attempt.
 *
 * Runs once per mount, guarded by a ref rather than by the effect's
 * dependencies: React runs effects twice in development, and attributing twice
 * would be a wasted write against a service that would refuse the second
 * anyway.
 */
export function ReferralClaim() {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void claimReferral();
  }, []);

  return null;
}
