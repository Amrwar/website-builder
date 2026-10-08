// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/server/auth";

/**
 * Idea tests against a real database: publishing, counting, leads, and the
 * boundaries between an owner, the public and staff.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/logger", () => {
  const quiet = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
  return { logger: { ...quiet, child: () => quiet } };
});
vi.mock("@/db/client", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@/db/schema");
  return { db: drizzle(new PGlite(), { schema }) };
});

process.env.DATABASE_URL = "postgres://pglite.invalid/validation";
process.env.GROWTH_FINGERPRINT_SECRET = "test-fingerprint-secret-0123456789";

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { roleHasPermission } = await import("@/config/roles");
const service = await import("./experiments");
const { emptyContent } = await import("@/lib/validation/content");

function contextFor(user: typeof schema.users.$inferSelect): AuthContext {
  return { user, can: (p) => roleHasPermission(user.role, p) };
}

async function makeUser(role: "customer" | "owner" | "finance" | "admin") {
  const [user] = await db
    .insert(schema.users)
    .values({
      clerkUserId: `user_${role}_${Math.random().toString(36).slice(2)}`,
      email: `${role}-${Math.random().toString(36).slice(2)}@example.test`,
      displayName: `Test ${role}`,
      role,
    })
    .returning();
  return contextFor(user!);
}

const content = (overrides: Record<string, unknown> = {}) => ({
  ...emptyContent("en"),
  businessName: "Little Loaves",
  oneLiner: "Fresh sourdough delivered every Saturday.",
  description: "A weekly bread subscription baked in Laval and delivered by bike.",
  targetCustomer: "Families in Laval",
  headline: "Saturday bread, at your door",
  price: { model: "monthly", amount: 32, currency: "CAD" },
  captureMode: "waitlist",
  availability: "soon",
  ...overrides,
});

const visitor = (
  overrides: Partial<{ ip: string; userAgent: string; viewerUserId: string | null }> = {},
) => ({
  ip: "203.0.113.7",
  userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/140",
  viewerUserId: null,
  ...overrides,
});

let founder: AuthContext;
let stranger: AuthContext;
let admin: AuthContext;

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  await migrate(db as never, { migrationsFolder: "drizzle" });
  founder = await makeUser("customer");
  stranger = await makeUser("customer");
  admin = await makeUser("admin");
}, 60_000);

describe("publishing", () => {
  let first = { id: "", slug: "" };

  it("publishes a valid test at an unguessable address, price in minor units", async () => {
    const result = await service.publishExperiment(content(), founder);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    first = result;
    expect(result.slug).toMatch(/^little-loaves-[a-z0-9]{8}$/);

    const page = await service.publicExperiment(result.slug);
    expect(page?.content.price).toEqual({
      model: "monthly",
      amountMinorUnits: 3200,
      currency: "CAD",
    });
    expect(page?.captureMode).toBe("waitlist");
  });

  it("refuses content the wizard would have refused", async () => {
    expect(await service.publishExperiment(content({ headline: "" }), founder)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(
      await service.publishExperiment(
        content({ details: "buy at https://example.com" }),
        founder,
      ),
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it("caps live tests per account", async () => {
    await service.publishExperiment(content(), founder);
    await service.publishExperiment(content(), founder);
    expect(await service.publishExperiment(content(), founder)).toEqual({
      ok: false,
      reason: "limit",
    });
    // Pausing one frees a slot; resuming it past the cap is refused.
    await service.setExperimentStatus(first.id, "paused", founder);
    const fourth = await service.publishExperiment(content(), founder);
    expect(fourth.ok).toBe(true);
    expect(await service.setExperimentStatus(first.id, "live", founder)).toEqual({
      ok: false,
      reason: "limit",
    });
  });

  it("lets nobody but the owner read or change a test", async () => {
    expect(await service.experimentResults(first.id, stranger)).toBeNull();
    expect(await service.setExperimentStatus(first.id, "closed", stranger)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await service.listExperiments(stranger)).toEqual([]);
    expect(await service.experimentResults("not-a-uuid", founder)).toBeNull();
  });
});

describe("signals and leads", () => {
  let slug = "";
  let id = "";

  beforeAll(async () => {
    const other = await makeUser("customer");
    const result = await service.publishExperiment(
      content({ captureMode: "inquiry", availability: "now" }),
      other,
    );
    if (!result.ok) throw new Error("publish failed");
    ({ slug, id } = result);
    founder = other;
  });

  it("counts views, distinct visitors and click-throughs", async () => {
    await service.recordVisit(slug, "view", visitor());
    await service.recordVisit(slug, "view", visitor());
    await service.recordVisit(
      slug,
      "view",
      visitor({ userAgent: "Mozilla/5.0 Safari/18" }),
    );
    await service.recordVisit(slug, "cta_click", visitor());
    await service.recordVisit(slug, "cta_click", visitor());

    const results = await service.experimentResults(id, founder);
    expect(results?.signals).toMatchObject({ views: 3, visitors: 2, ctaClicks: 1 });
    expect(results?.distinctVisitors).toBe(true);
  });

  it("ignores crawlers and the owner's own visits", async () => {
    expect(
      await service.recordVisit(slug, "view", visitor({ userAgent: "Googlebot/2.1" })),
    ).toBe(false);
    expect(
      await service.recordVisit(
        slug,
        "view",
        visitor({ userAgent: "HeadlessChrome/140" }),
      ),
    ).toBe(false);
    expect(
      await service.recordVisit(slug, "view", visitor({ viewerUserId: founder.user.id })),
    ).toBe(false);
    expect((await service.experimentResults(id, founder))?.signals.views).toBe(3);
  });

  it("stores an inquiry with consent, and counts it", async () => {
    const result = await service.submitLead(
      slug,
      {
        name: "Sam",
        email: "Sam@Example.test",
        message: "Do you deliver to Chomedey?",
        consent: true,
      },
      visitor(),
    );
    expect(result).toEqual({ ok: true });
    const results = await service.experimentResults(id, founder);
    expect(results?.leads).toHaveLength(1);
    expect(results?.leads[0]).toMatchObject({
      email: "sam@example.test",
      message: "Do you deliver to Chomedey?",
    });
    expect(results?.signals).toMatchObject({ inquiries: 1, leads: 1 });
    expect(results?.signals.conversionRate).toBeCloseTo(0.5);
    expect(results?.daily.at(-1)).toMatchObject({ views: 3, leads: 1 });
  });

  it("refuses a lead without consent or a real address", async () => {
    expect(
      await service.submitLead(
        slug,
        { email: "sam@example.test", consent: false },
        visitor(),
      ),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(
      await service.submitLead(slug, { email: "not-an-email", consent: true }, visitor()),
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it("answers a filled honeypot as a success and stores nothing", async () => {
    const before = (await service.experimentResults(id, founder))?.leads.length;
    expect(
      await service.submitLead(
        slug,
        { email: "bot@example.test", consent: true, company: "ACME" },
        visitor(),
      ),
    ).toEqual({ ok: true });
    expect((await service.experimentResults(id, founder))?.leads.length).toBe(before);
  });

  it("stops taking anything once paused, and closing is final", async () => {
    await service.setExperimentStatus(id, "paused", founder);
    expect(await service.recordVisit(slug, "view", visitor())).toBe(false);
    expect(
      await service.submitLead(
        slug,
        { email: "late@example.test", consent: true },
        visitor(),
      ),
    ).toEqual({
      ok: false,
      reason: "closed",
    });
    await service.setExperimentStatus(id, "closed", founder);
    expect(await service.setExperimentStatus(id, "live", founder)).toEqual({
      ok: false,
      reason: "closed",
    });
  });

  it("keeps a waitlist to an email address", async () => {
    const owner = await makeUser("customer");
    const result = await service.publishExperiment(content(), owner);
    if (!result.ok) throw new Error("publish failed");
    await service.submitLead(
      result.slug,
      { email: "w@example.test", message: "ignored", consent: true },
      visitor(),
    );
    const results = await service.experimentResults(result.id, owner);
    expect(results?.leads[0]?.message).toBeNull();
    expect(results?.signals.signups).toBe(1);
  });
});

describe("moderation", () => {
  it("lets staff see and close pages, but never their leads", async () => {
    const list = await service.listExperimentsForStaff(admin);
    expect(list.length).toBeGreaterThan(0);
    expect(Object.keys(list[0]!)).not.toContain("leads");

    const target = list.find((entry) => entry.status === "live")!;
    await service.closeExperimentAsStaff(target.id, "Impersonates a bank", admin);
    expect((await service.publicExperiment(target.slug))?.status).toBe("closed");

    const [audit] = await db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.subjectId, target.id));
    expect(audit).toMatchObject({
      action: "validation.closed_by_staff",
      reason: "Impersonates a bank",
    });
  });

  it("refuses customers and roles without project management, as not_found", async () => {
    const finance = await makeUser("finance");
    for (const caller of [stranger, finance]) {
      await expect(service.listExperimentsForStaff(caller)).rejects.toMatchObject({
        code: "not_found",
      });
    }
  });

  it("deletes a customer's tests and their leads with the account", async () => {
    const owner = await makeUser("customer");
    const result = await service.publishExperiment(content(), owner);
    if (!result.ok) throw new Error("publish failed");
    await service.submitLead(
      result.slug,
      { email: "gone@example.test", consent: true },
      visitor(),
    );
    await db.delete(schema.users).where(eq(schema.users.id, owner.user.id));
    const leads = await db
      .select()
      .from(schema.validationLeads)
      .where(eq(schema.validationLeads.experimentId, result.id));
    expect(leads).toEqual([]);
  });
});
