import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Role escalation.
 *
 * The brief asks explicitly for a role-escalation test, and this is the
 * operation worth attacking: anyone who can set roles can grant themselves
 * everything else. Every test here is an attempt to get more privilege than
 * the actor started with.
 */

const updates: Record<string, unknown>[] = [];
const audits: { action: string; after?: Record<string, unknown> }[] = [];

let subjectRow: Record<string, unknown> | undefined;

vi.mock("@/db/client", () => ({
  db: {
    query: { users: { findFirst: () => Promise.resolve(subjectRow) } },
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updates.push(values);
        return { where: () => Promise.resolve([]) };
      },
    }),
  },
}));

vi.mock("./audit", () => ({
  recordAudit: (input: { action: string; after?: Record<string, unknown> }) => {
    audits.push({ action: input.action, after: input.after });
    return Promise.resolve();
  },
  diffFields: () => null,
}));

const { changeUserRole } = await import("./team");

function actor(role: string, id = "actor-1") {
  return {
    user: { id, email: `${role}@example.test`, role, clerkUserId: `user_${role}` },
    can: (permission: string) => {
      if (role === "owner") return true;
      if (role === "admin") return permission !== "settings:manage";
      return false;
    },
  } as never;
}

function subject(role: string, id = "subject-1") {
  return { id, email: `${role}-subject@example.test`, role };
}

beforeEach(() => {
  updates.length = 0;
  audits.length = 0;
  subjectRow = subject("support");
});

/* --- Escalation --------------------------------------------------------- */

describe("nobody can promote themselves", () => {
  it("refuses an actor changing their own role, even as owner", async () => {
    // An owner changing their own role is how a company locks itself out.
    subjectRow = { id: "actor-1", email: "owner@example.test", role: "owner" };

    await expect(
      changeUserRole("actor-1", "customer", actor("owner")),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(updates).toHaveLength(0);
  });

  it("records the attempt in the audit log", async () => {
    subjectRow = { id: "actor-1", email: "admin@example.test", role: "admin" };
    await changeUserRole("actor-1", "owner", actor("admin")).catch(() => undefined);

    const entry = audits.find((a) => a.action === "user.role_change_refused");
    expect(entry?.after?.refusal).toBe("self");
  });
});

describe("nobody can grant a role at or above their own", () => {
  it("refuses an administrator granting owner", async () => {
    await expect(
      changeUserRole("subject-1", "owner", actor("admin")),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(updates).toHaveLength(0);
  });

  it("refuses an administrator granting administrator", async () => {
    // Otherwise one compromised admin account multiplies into many.
    await expect(
      changeUserRole("subject-1", "admin", actor("admin")),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("records the refusal reason", async () => {
    await changeUserRole("subject-1", "owner", actor("admin")).catch(() => undefined);
    expect(audits.at(-1)?.after?.refusal).toBe("rank");
  });

  it("lets the owner appoint an administrator", async () => {
    const result = await changeUserRole("subject-1", "admin", actor("owner"));
    expect(result.to).toBe("admin");
    expect(updates[0]?.role).toBe("admin");
  });

  it("lets an administrator appoint roles beneath them", async () => {
    const result = await changeUserRole("subject-1", "developer", actor("admin"));
    expect(result.to).toBe("developer");
  });
});

describe("nobody can act on someone who outranks them", () => {
  it("stops one administrator demoting another", async () => {
    subjectRow = subject("admin", "subject-2");

    await expect(
      changeUserRole("subject-2", "support", actor("admin")),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(audits.at(-1)?.after?.refusal).toBe("outranked");
  });

  it("stops an administrator demoting the owner", async () => {
    subjectRow = subject("owner", "subject-3");

    await expect(
      changeUserRole("subject-3", "customer", actor("admin")),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("lets the owner demote an administrator", async () => {
    subjectRow = subject("admin", "subject-4");
    const result = await changeUserRole("subject-4", "support", actor("owner"));
    expect(result.to).toBe("support");
  });
});

describe("roles without user:manage reach nothing", () => {
  const roles = ["project_manager", "finance", "developer", "designer", "qa", "support"];

  it.each(roles)("%s is refused, as not_found", async (role) => {
    await expect(
      changeUserRole("subject-1", "developer", actor(role)),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("writes nothing when refused", async () => {
    await changeUserRole("subject-1", "admin", actor("support")).catch(() => undefined);
    expect(updates).toHaveLength(0);
  });

  it("reports not_found, not forbidden, so the endpoint is not confirmed", async () => {
    const error = await changeUserRole("subject-1", "developer", actor("qa")).catch(
      (e: unknown) => e,
    );
    expect((error as { code: string }).code).toBe("not_found");
  });
});

describe("the requested role is narrowed, not trusted", () => {
  it("refuses a role that does not exist", async () => {
    for (const value of ["superadmin", "ADMIN", "", "owner ", "root"]) {
      await expect(
        changeUserRole("subject-1", value, actor("owner")),
      ).rejects.toMatchObject({ code: "bad_request" });
    }
    expect(updates).toHaveLength(0);
  });
});

describe("every change is recorded", () => {
  it("writes an audit entry with the before and after role", async () => {
    await changeUserRole("subject-1", "developer", actor("owner"));

    const entry = audits.find((a) => a.action === "user.role_changed");
    expect(entry).toBeDefined();
    expect(entry?.after?.role).toBe("developer");
  });

  it("is a no-op when the role is unchanged", async () => {
    subjectRow = subject("developer");
    const result = await changeUserRole("subject-1", "developer", actor("owner"));

    expect(result.from).toBe("developer");
    expect(updates).toHaveLength(0);
  });
});
