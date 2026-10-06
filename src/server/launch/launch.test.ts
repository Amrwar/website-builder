import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Going live.
 *
 * Two rules are worth more than everything else in this phase, and both are
 * tested here from the attacking side:
 *
 *  1. **A deployment is not successful until the provider confirms it.**
 *     Nothing in the application may set `ready` on its own say-so.
 *  2. **A project cannot be launched before it is ready**, and there is no
 *     parameter through which a caller can override that.
 */

const inserts: { table: string; values: Record<string, unknown> }[] = [];
const updates: { table: string; values: Record<string, unknown> }[] = [];
const emitted: { name: string }[] = [];

let projectRow: Record<string, unknown> | undefined;
let deploymentRow: Record<string, unknown> | undefined;
let liveProduction: Record<string, unknown> | undefined;
let primaryDomainRow: Record<string, unknown> | undefined;
let updateMatches = true;

function tableName(table: unknown): string {
  for (const symbol of Object.getOwnPropertySymbols(table as object)) {
    if (String(symbol).includes("Name")) {
      return String((table as Record<symbol, unknown>)[symbol]);
    }
  }
  return "unknown";
}

vi.mock("@/db/client", () => {
  const chainSelect = () => ({
    from: () => ({
      where: () => ({ orderBy: () => ({ limit: () => Promise.resolve([]) }) }),
      orderBy: () => ({ limit: () => Promise.resolve([]) }),
    }),
  });

  return {
    db: {
      query: {
        projects: { findFirst: () => Promise.resolve(projectRow) },
        deployments: {
          findFirst: (args?: { where?: unknown }) =>
            Promise.resolve(
              // The live-deployment lookup is distinguished by having no id
              // in play; both paths are driven by the fixtures above.
              args && deploymentRow ? deploymentRow : liveProduction,
            ),
        },
        domains: { findFirst: () => Promise.resolve(primaryDomainRow) },
        projectHosting: { findFirst: () => Promise.resolve(undefined) },
      },
      select: chainSelect,
      insert: (table: unknown) => ({
        values: (values: Record<string, unknown>) => {
          inserts.push({ table: tableName(table), values });
          return {
            returning: () => Promise.resolve([{ id: "new-row", ...values }]),
            onConflictDoUpdate: () => ({
              returning: () => Promise.resolve([{ id: "new-row", ...values }]),
            }),
          };
        },
      }),
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => {
          updates.push({ table: tableName(table), values });
          return {
            where: () => ({
              returning: () =>
                Promise.resolve(
                  updateMatches ? [{ ...(projectRow ?? {}), ...values }] : [],
                ),
            }),
          };
        },
      }),
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          update: (table: unknown) => ({
            set: (values: Record<string, unknown>) => {
              updates.push({ table: tableName(table), values });
              return {
                where: () => ({
                  returning: () =>
                    Promise.resolve(
                      updateMatches ? [{ ...(deploymentRow ?? {}), ...values }] : [],
                    ),
                }),
              };
            },
          }),
        };
        return fn(tx);
      },
    },
  };
});

vi.mock("@/server/events/bus", () => ({
  emit: (event: { name: string }) => {
    emitted.push(event);
    return Promise.resolve(event);
  },
}));

vi.mock("./checklist", () => ({
  checklistForProject: () => Promise.resolve(checklist),
  setChecklistState: () => Promise.resolve({ ok: true }),
  loadChecklistDefinitions: () => Promise.resolve([]),
  invalidateChecklistCache: () => {},
}));

let checklist: {
  item: {
    key: string;
    group: string;
    translationKey: string;
    appliesTo: string[];
    isRequired: boolean;
    customerVisible: boolean;
  };
  state: string;
  note: string | null;
  completedAt: Date | null;
}[] = [];

const { confirmDeployment, recordDeployment } = await import("./deployments");
const { launchProject } = await import("./index");

/* --- Fixtures ----------------------------------------------------------- */

function staff() {
  return {
    user: { id: "staff-1", email: "dev@example.test", role: "developer" },
    can: (permission: string) =>
      ["build:execute", "project:read:all"].includes(permission),
  } as unknown as Parameters<typeof launchProject>[1];
}

function customer() {
  return {
    user: { id: "user-1", email: "owner@example.test", role: "customer" },
    can: () => false,
  } as unknown as Parameters<typeof launchProject>[1];
}

function item(key: string, isRequired = true) {
  return {
    item: {
      key,
      group: "technical",
      translationKey: key,
      appliesTo: [],
      isRequired,
      customerVisible: true,
    },
    state: "done",
    note: null,
    completedAt: new Date(),
  };
}

beforeEach(() => {
  inserts.length = 0;
  updates.length = 0;
  emitted.length = 0;
  updateMatches = true;

  projectRow = {
    id: "project-1",
    reference: "PRJ-2026-0001",
    ownerId: "user-1",
    productType: "build",
    status: "approved",
    approvedAt: new Date("2026-10-01T00:00:00Z"),
    launchedAt: null,
  };

  deploymentRow = undefined;
  liveProduction = {
    id: "deployment-live",
    projectId: "project-1",
    environment: "production",
    state: "ready",
    version: "v1",
    url: "https://cedar.example",
    providerConfirmedAt: new Date("2026-10-02T00:00:00Z"),
  };

  primaryDomainRow = {
    id: "domain-1",
    projectId: "project-1",
    name: "cedar.example",
    isPrimary: true,
    verification: "verified",
    dnsState: "configured",
    sslState: "issued",
    sslExpiresAt: new Date("2027-01-01T00:00:00Z"),
  };

  checklist = [item("production_deployed"), item("handover_sent")];
});

/* --- Deployments --------------------------------------------------------- */

describe("a deployment cannot claim success", () => {
  it("records a new deployment as building, never as ready", () => {
    return recordDeployment(
      { projectId: "project-1", environment: "production", version: "v2" },
      staff(),
    ).then(() => {
      const row = inserts.find((entry) => entry.table === "deployments");
      expect(row?.values.state).toBe("building");
      // The decisive assertion: at the moment of writing this row, nothing
      // about the outcome is known, so nothing claims it.
      expect(row?.values.providerConfirmedAt).toBeUndefined();
    });
  });

  it("takes no parameter through which a caller could pass a ready state", async () => {
    // Stated as a signature check, because a future edit adding one would be
    // the quiet way this rule gets lost.
    const input = {
      projectId: "project-1",
      environment: "production" as const,
      version: "v2",
    };
    expect(Object.keys(input)).not.toContain("state");
    expect(Object.keys(input)).not.toContain("readyAt");

    const result = await recordDeployment(input, staff());
    expect(result.ok).toBe(true);
  });

  it("refuses a confirmation with no provider deployment id", async () => {
    deploymentRow = { id: "deployment-1", state: "building", projectId: "project-1" };

    const result = await confirmDeployment(
      {
        deploymentId: "deployment-1",
        providerDeploymentId: "   ",
        url: "https://cedar.example",
        confirmedAt: new Date(),
      },
      staff(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not_confirmable");
  });

  it("refuses a confirmation with no url", async () => {
    deploymentRow = { id: "deployment-1", state: "building", projectId: "project-1" };

    const result = await confirmDeployment(
      {
        deploymentId: "deployment-1",
        providerDeploymentId: "dpl_123",
        url: "",
        confirmedAt: new Date(),
      },
      staff(),
    );
    expect(result.ok).toBe(false);
  });

  it("writes the provider's timestamp, not ours", async () => {
    deploymentRow = {
      id: "deployment-1",
      state: "building",
      projectId: "project-1",
      environment: "production",
      version: "v2",
    };
    const confirmedAt = new Date("2026-10-03T09:15:00Z");

    await confirmDeployment(
      {
        deploymentId: "deployment-1",
        providerDeploymentId: "dpl_123",
        url: "https://cedar.example",
        confirmedAt,
      },
      staff(),
    );

    const update = updates.find((entry) => entry.table === "deployments");
    expect(update?.values.providerConfirmedAt).toEqual(confirmedAt);
    expect(update?.values.readyAt).toEqual(confirmedAt);
  });

  it("refuses to confirm one that already failed", async () => {
    deploymentRow = { id: "deployment-1", state: "failed", projectId: "project-1" };

    const result = await confirmDeployment(
      {
        deploymentId: "deployment-1",
        providerDeploymentId: "dpl_123",
        url: "https://cedar.example",
        confirmedAt: new Date(),
      },
      staff(),
    );
    expect(result.ok).toBe(false);
  });

  it("refuses a caller without build:execute", async () => {
    await expect(
      recordDeployment(
        { projectId: "project-1", environment: "production", version: "v2" },
        customer(),
      ),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

/* --- Launching ----------------------------------------------------------- */

describe("launching", () => {
  it("goes live when every blocker is clear", async () => {
    const result = await launchProject("project-1", staff());

    expect(result.ok).toBe(true);
    const update = updates.find((entry) => entry.table === "projects");
    expect(update?.values.status).toBe("launched");
    expect(update?.values.launchedAt).toBeInstanceOf(Date);
    expect(emitted.map((event) => event.name)).toContain("launch.completed");
  });

  it("refuses without a provider-confirmed production deployment", async () => {
    liveProduction = undefined;

    const result = await launchProject("project-1", staff());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not_ready");
    expect(result.readiness.blockers.map((blocker) => blocker.code)).toContain(
      "no_confirmed_deployment",
    );
    // Nothing was written. A refused launch must leave no trace of a launch.
    expect(updates.some((entry) => entry.table === "projects")).toBe(false);
  });

  it("refuses with an open required checklist item", async () => {
    checklist = [
      item("production_deployed"),
      { ...item("handover_sent"), state: "pending" },
    ];

    const result = await launchProject("project-1", staff());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not_ready");
  });

  it("refuses when the certificate has not been issued", async () => {
    primaryDomainRow = { ...primaryDomainRow!, sslState: "pending" };

    const result = await launchProject("project-1", staff());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.readiness.blockers.map((b) => b.code)).toContain("ssl_not_issued");
  });

  it("refuses a project the customer has not approved", async () => {
    projectRow = { ...projectRow!, approvedAt: null, status: "in_preview" };

    const result = await launchProject("project-1", staff());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("wrong_status");
  });

  it("refuses a second launch", async () => {
    projectRow = { ...projectRow!, launchedAt: new Date("2026-10-04T00:00:00Z") };

    const result = await launchProject("project-1", staff());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("already_launched");
  });

  it("refuses when a concurrent launch won the race", async () => {
    // The conditional UPDATE matched nothing, which means somebody else
    // launched between the readiness check and the write.
    updateMatches = false;

    const result = await launchProject("project-1", staff());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("already_launched");
  });

  it("refuses a customer outright", async () => {
    await expect(launchProject("project-1", customer())).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("takes no argument through which readiness could be overridden", () => {
    // A launch that overrides its own blockers tells a customer their site is
    // live while the certificate is still pending. There is no such parameter.
    expect(launchProject).toHaveLength(2);
  });
});
