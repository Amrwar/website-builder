import { describe, expect, it } from "vitest";

import { LAUNCH_CHECKLIST, checklistFor } from "@/config/launch";
import type { ChecklistState } from "@/db/schema/enums";
import {
  assessLaunchReadiness,
  sslExpiryWarning,
  type ChecklistEntry,
  type LaunchFacts,
} from "./readiness";

/**
 * Launch readiness.
 *
 * The rule under test is the one the brief stated plainly: do not pretend a
 * deployment succeeded if the provider has not confirmed it. Everything else
 * here exists to make sure "ready" cannot be reached by assumption.
 */

const ITEMS = checklistFor("build", LAUNCH_CHECKLIST);

function entries(overrides: Record<string, ChecklistState> = {}): ChecklistEntry[] {
  return ITEMS.map((item) => ({
    item,
    state: overrides[item.key] ?? "pending",
    note: null,
    completedAt: null,
  }));
}

function allDone(overrides: Record<string, ChecklistState> = {}): ChecklistEntry[] {
  return ITEMS.map((item) => ({
    item,
    state: overrides[item.key] ?? "done",
    note: null,
    completedAt: new Date("2026-10-01T00:00:00Z"),
  }));
}

function facts(overrides: Partial<LaunchFacts> = {}): LaunchFacts {
  return {
    hasConfirmedProductionDeployment: true,
    productionUrl: "https://cedar.example",
    domainVerification: "verified",
    dnsState: "configured",
    sslState: "issued",
    previewApproved: true,
    launchedAt: null,
    ...overrides,
  };
}

describe("a project is ready only when everything says so", () => {
  it("is ready when the checklist is resolved and the facts hold", () => {
    const result = assessLaunchReadiness(allDone(), facts());

    expect(result.ready).toBe(true);
    expect(result.blockers).toHaveLength(0);
    expect(result.percent).toBe(100);
  });

  it("is not ready with a fresh checklist", () => {
    const result = assessLaunchReadiness(entries(), facts());

    expect(result.ready).toBe(false);
    expect(result.percent).toBe(0);
    expect(result.blockers[0]?.code).toBe("checklist_incomplete");
  });

  it("names the items responsible rather than just refusing", () => {
    const result = assessLaunchReadiness(
      allDone({ forms_tested: "pending", handover_sent: "pending" }),
      facts(),
    );

    const blocker = result.blockers.find(
      (entry) => entry.code === "checklist_incomplete",
    );
    expect(blocker?.itemKeys).toEqual(["forms_tested", "handover_sent"]);
  });

  it("counts a deliberate not-applicable as resolved", () => {
    // Ruling an item out is a decision somebody made, which is different from
    // leaving it unfinished forever.
    const result = assessLaunchReadiness(
      allDone({ analytics_installed: "not_applicable" }),
      facts(),
    );
    expect(result.ready).toBe(true);
  });

  it("ignores optional items when deciding readiness", () => {
    const optional = ITEMS.filter((item) => !item.isRequired).map((item) => item.key);
    expect(optional.length).toBeGreaterThan(0);

    const result = assessLaunchReadiness(
      allDone(Object.fromEntries(optional.map((key) => [key, "pending" as const]))),
      facts(),
    );
    expect(result.ready).toBe(true);
  });
});

describe("a deployment counts only when the provider confirmed it", () => {
  it("refuses to be ready without a confirmed production deployment", () => {
    // The whole rule in one assertion. Our own code believing a deploy
    // succeeded is not evidence that it did.
    const result = assessLaunchReadiness(
      allDone(),
      facts({ hasConfirmedProductionDeployment: false }),
    );

    expect(result.ready).toBe(false);
    expect(result.blockers.map((blocker) => blocker.code)).toContain(
      "no_confirmed_deployment",
    );
  });

  it("is not satisfied by a checklist tick alone", () => {
    // Staff marking "production deployed" cannot override the observed fact.
    const result = assessLaunchReadiness(
      allDone({ production_deployed: "done" }),
      facts({ hasConfirmedProductionDeployment: false }),
    );
    expect(result.ready).toBe(false);
  });
});

describe("domain, DNS and certificate are three separate refusals", () => {
  it("blocks on an unverified domain", () => {
    const result = assessLaunchReadiness(
      allDone(),
      facts({ domainVerification: "pending" }),
    );
    expect(result.blockers.map((b) => b.code)).toContain("domain_unverified");
  });

  it("blocks on DNS that points elsewhere", () => {
    const result = assessLaunchReadiness(allDone(), facts({ dnsState: "misconfigured" }));
    expect(result.blockers.map((b) => b.code)).toContain("dns_not_configured");
  });

  it("blocks on a certificate that has not been issued", () => {
    const result = assessLaunchReadiness(allDone(), facts({ sslState: "pending" }));
    expect(result.blockers.map((b) => b.code)).toContain("ssl_not_issued");
  });

  it("reports all of them at once, so one fix does not reveal the next", () => {
    const result = assessLaunchReadiness(
      allDone(),
      facts({
        hasConfirmedProductionDeployment: false,
        domainVerification: "failed",
        dnsState: "unconfigured",
        sslState: "none",
      }),
    );
    expect(result.blockers).toHaveLength(4);
  });
});

describe("products that do not deploy anywhere", () => {
  it("does not demand a certificate from an automation", () => {
    const automationItems = checklistFor("automation", LAUNCH_CHECKLIST);
    expect(automationItems.some((item) => item.key === "production_deployed")).toBe(
      false,
    );

    const result = assessLaunchReadiness(
      automationItems.map((item) => ({
        item,
        state: "done" as const,
        note: null,
        completedAt: null,
      })),
      facts({
        hasConfirmedProductionDeployment: false,
        domainVerification: null,
        dnsState: null,
        sslState: null,
      }),
    );

    expect(result.ready).toBe(true);
  });
});

describe("an already launched project", () => {
  it("is reported as launched rather than ready", () => {
    const result = assessLaunchReadiness(
      allDone(),
      facts({ launchedAt: new Date("2026-09-01T00:00:00Z") }),
    );

    expect(result.launched).toBe(true);
    expect(result.ready).toBe(false);
  });
});

describe("certificate expiry", () => {
  const now = new Date("2026-10-06T00:00:00Z");

  it("says nothing when renewal is far off", () => {
    expect(sslExpiryWarning(new Date("2027-01-01T00:00:00Z"), now, 30)).toBeNull();
  });

  it("warns inside the window", () => {
    const warning = sslExpiryWarning(new Date("2026-10-20T00:00:00Z"), now, 30);
    expect(warning?.daysRemaining).toBe(14);
    expect(warning?.expired).toBe(false);
  });

  it("reports an expired certificate as expired, not as nearly due", () => {
    const warning = sslExpiryWarning(new Date("2026-10-01T00:00:00Z"), now, 30);
    expect(warning?.expired).toBe(true);
    expect(warning!.daysRemaining).toBeLessThan(0);
  });

  it("says nothing when there is no certificate to talk about", () => {
    expect(sslExpiryWarning(null, now, 30)).toBeNull();
  });
});
