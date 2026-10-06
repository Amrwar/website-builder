import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The audit log.
 *
 * Three properties are worth testing, and they are the three that make a log
 * worth keeping: only the senior ranks can read it, a failed write never takes
 * down the act it describes, and nothing in the module can change an entry
 * once written.
 */

const inserts: Record<string, unknown>[] = [];
let insertThrows = false;
const loggedErrors: string[] = [];

vi.mock("@/db/client", () => ({
  db: {
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        if (insertThrows) return Promise.reject(new Error("db down"));
        inserts.push(values);
        return Promise.resolve([]);
      },
    }),
    select: () => {
      const chain = {
        from: () => chain,
        leftJoin: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        offset: () => Promise.resolve([]),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve([{ total: 0 }]).then(resolve),
      };
      return chain;
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: (message: string) => loggedErrors.push(message),
    warn: () => undefined,
    info: () => undefined,
    debug: () => undefined,
    child: () => ({
      error: () => undefined,
      warn: () => undefined,
      info: () => undefined,
      debug: () => undefined,
    }),
  },
}));

const auditModule = await import("./audit");
const { diffFields, readAuditLog, recordAudit, auditTrailFor } = auditModule;

function actor(role: string, canRead: boolean) {
  return {
    user: { id: `${role}-1`, email: `${role}@example.test`, role },
    can: (permission: string) => permission === "audit:read" && canRead,
  } as never;
}

beforeEach(() => {
  inserts.length = 0;
  loggedErrors.length = 0;
  insertThrows = false;
});

describe("writing", () => {
  it("snapshots who did it, so the entry survives the account", async () => {
    await recordAudit({
      category: "security",
      action: "user.role_changed",
      actor: actor("owner", true),
      subjectType: "user",
      subjectId: "u1",
    });

    expect(inserts[0]?.actorEmail).toBe("owner@example.test");
    expect(inserts[0]?.actorRole).toBe("owner");
  });

  it("never throws, so a failed log cannot undo the act it describes", async () => {
    // A refund that succeeded and failed to log is a reconciliation problem.
    // One rolled back because the log was down is a customer without money.
    insertThrows = true;

    await expect(
      recordAudit({
        category: "finance",
        action: "refund.executed",
        actor: actor("admin", true),
        subjectType: "refund",
      }),
    ).resolves.toBeUndefined();
  });

  it("logs loudly when it cannot write", async () => {
    insertThrows = true;
    await recordAudit({
      category: "finance",
      action: "refund.executed",
      actor: actor("admin", true),
      subjectType: "refund",
    });
    expect(loggedErrors).toContain("AUDIT WRITE FAILED");
  });
});

describe("reading", () => {
  it("is refused without audit:read", async () => {
    for (const role of ["finance", "project_manager", "developer", "support"]) {
      await expect(readAuditLog({}, actor(role, false))).rejects.toMatchObject({
        code: "not_found",
      });
    }
  });

  it("reports not_found, so the endpoint is not confirmed to exist", async () => {
    const error = await readAuditLog({}, actor("developer", false)).catch(
      (e: unknown) => e,
    );
    expect((error as { code: string }).code).toBe("not_found");
  });

  it("is allowed with audit:read", async () => {
    await expect(readAuditLog({}, actor("owner", true))).resolves.toBeDefined();
  });

  it("returns nothing from the per-subject trail without the permission", async () => {
    // Used on the project page, where an unauthorized viewer should simply not
    // see the section rather than receive an error.
    await expect(
      auditTrailFor("project", "p1", actor("designer", false)),
    ).resolves.toEqual([]);
  });

  it("caps the page size, so one request cannot pull the whole log", async () => {
    const result = await readAuditLog({ pageSize: 100_000 }, actor("owner", true));
    expect(result.pageSize).toBeLessThanOrEqual(100);
  });

  it("refuses a page below one", async () => {
    const result = await readAuditLog({ page: -5 }, actor("owner", true));
    expect(result.page).toBe(1);
  });
});

describe("the module offers no way to change an entry", () => {
  it("exports no update or delete function", () => {
    // Structural rather than behavioural: an audit log the console can amend
    // is not evidence of anything, so the absence is the feature.
    const exported = Object.keys(auditModule);
    expect(exported.some((name) => /update|delete|remove|edit/i.test(name))).toBe(false);
  });
});

describe("diffFields", () => {
  it("records only what changed", () => {
    const result = diffFields({ role: "support", email: "a@b.c" }, { role: "developer" });
    expect(result).toEqual({
      before: { role: "support" },
      after: { role: "developer" },
    });
  });

  it("returns null when nothing changed", () => {
    expect(diffFields({ role: "support" }, { role: "support" })).toBeNull();
  });
});
