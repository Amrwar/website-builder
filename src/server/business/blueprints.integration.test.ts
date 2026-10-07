// @vitest-environment node
import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/server/auth";

/**
 * Blueprints against a real database.
 *
 * PGlite with every migration applied, so the append-only trigger on
 * `business_blueprint_versions` and the key-format checks are the production
 * ones. The session is the only thing replaced; every call names its caller
 * explicitly and runs through the real permission matrix.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));
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
vi.mock("@/server/auth", () => ({
  getAuthContext: async () => null,
  requireUser: async () => {
    throw new Error("every call in this test passes its caller explicitly");
  },
}));

process.env.DATABASE_URL = "postgres://pglite.invalid/blueprints";

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { roleHasPermission } = await import("@/config/roles");
const service = await import("./blueprints");
const { draftFromBlueprint } = await import("@/lib/business/blueprint");

function contextFor(user: typeof schema.users.$inferSelect): AuthContext {
  return { user, can: (p) => roleHasPermission(user.role, p) };
}

async function makeUser(role: "customer" | "owner" | "finance") {
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

async function rejectedBy(promise: Promise<unknown>, pattern: RegExp) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e as Error & { cause?: Error; code?: string },
  );
  expect(error, "expected a refusal").not.toBeNull();
  expect(`${error!.code ?? ""} ${error!.message} ${error!.cause?.message ?? ""}`).toMatch(
    pattern,
  );
}

const COPY = {
  en: { name: "Bakery", summary: "Bread, cakes and orders for collection." },
  fr: { name: "Boulangerie", summary: "Pains, gâteaux et commandes à emporter." },
  ar: { name: "مخبز", summary: "خبز وكعك وطلبات للاستلام." },
};

let owner: AuthContext;
let finance: AuthContext;
let customer: AuthContext;

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  await migrate(db as never, { migrationsFolder: "drizzle" });
  owner = await makeUser("owner");
  finance = await makeUser("finance");
  customer = await makeUser("customer");
}, 60_000);

async function live(key: string) {
  const catalog = await service.loadBusinessCatalog();
  return {
    entry: catalog.blueprints.find((blueprint) => blueprint.key === key),
    offered: service
      .offeredBlueprints(catalog)
      .some((blueprint) => blueprint.key === key),
  };
}

describe("blueprints, against Postgres", () => {
  it("offers the shipped catalogue while the tables are empty", async () => {
    const catalog = await service.loadBusinessCatalog();
    expect(catalog.blueprints).toHaveLength(13);
    expect(catalog.blueprints.every((entry) => entry.version === 0)).toBe(true);
    expect(service.offeredBlueprints(catalog)).toHaveLength(13);
  });

  it("refuses writes from anyone but the owner, as not_found", async () => {
    const barber = (await live("barber")).entry!;
    await rejectedBy(
      service.saveBlueprintVersion("barber", { definition: barber.definition }, finance),
      /not_found/,
    );
    await rejectedBy(service.readBlueprintsForAdmin(customer), /not_found/);
    await rejectedBy(
      service.setBlueprintStatus("barber", "archived", finance),
      /not_found/,
    );
    await rejectedBy(
      service.saveCategory({ key: "health", isActive: false }, finance),
      /not_found/,
    );
  });

  it("keeps the shipped version live until a new one is published", async () => {
    const barber = (await live("barber")).entry!;
    const next = {
      ...barber.definition,
      recommended: [...barber.definition.recommended, "payments"],
      optional: barber.definition.optional.filter((id) => id !== "payments"),
    };
    const saved = await service.saveBlueprintVersion(
      "barber",
      { definition: next, note: "Card payments are now standard." },
      owner,
    );
    expect(saved).toEqual({ version: 1, published: false });
    expect((await live("barber")).entry?.version).toBe(0);

    const admin = await service.readBlueprintsForAdmin(owner);
    expect(admin.blueprints.find((entry) => entry.key === "barber")?.hasUnpublished).toBe(
      true,
    );

    await service.publishBlueprintVersion("barber", 1, owner);
    const published = (await live("barber")).entry!;
    expect(published.version).toBe(1);
    expect(published.definition.recommended).toContain("payments");
  });

  it("makes versions immutable in the database itself", async () => {
    const [row] = await db
      .select()
      .from(schema.businessBlueprintVersions)
      .where(eq(schema.businessBlueprintVersions.version, 1))
      .limit(1);
    await rejectedBy(
      db
        .update(schema.businessBlueprintVersions)
        .set({ definition: { tampered: true } })
        .where(eq(schema.businessBlueprintVersions.id, row!.id)),
      /immutable/,
    );
    await rejectedBy(
      db
        .update(schema.businessBlueprintVersions)
        .set({ publishedAt: new Date("2020-01-01") })
        .where(eq(schema.businessBlueprintVersions.id, row!.id)),
      /cannot be unpublished or re-dated/,
    );
    await rejectedBy(
      db
        .delete(schema.businessBlueprintVersions)
        .where(eq(schema.businessBlueprintVersions.id, row!.id)),
      /append-only/,
    );
    await rejectedBy(
      db.execute(sql`insert into business_blueprints (key) values ('Not A Key')`),
      /business_blueprints_key_format/,
    );
  });

  it("rolls back by publishing an older version, and audits both", async () => {
    const v1 = (await live("barber")).entry!.definition;
    const v2 = await service.saveBlueprintVersion(
      "barber",
      { definition: { ...v1, buildType: "system" }, publish: true },
      owner,
    );
    expect(v2).toEqual({ version: 2, published: true });
    expect((await live("barber")).entry?.definition.buildType).toBe("system");

    await service.publishBlueprintVersion("barber", 1, owner);
    expect((await live("barber")).entry).toMatchObject({ version: 1 });
    expect((await live("barber")).entry?.definition.buildType).toBe("website");

    const audits = await db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.subjectId, "barber"));
    expect(audits.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(["blueprint.version_saved", "blueprint.version_published"]),
    );
  });

  it("creates a blueprint as a draft, offered only once published", async () => {
    const definition = {
      categoryKey: "food_hospitality",
      buildType: "website",
      recommended: ["home", "menu", "contact"],
      optional: ["online_ordering"],
      copy: null,
    };
    // A new blueprint has no catalogue wording to fall back on.
    await rejectedBy(
      service.createBlueprint("bakery", { definition }, owner),
      /every|en, fr, ar/,
    );
    await rejectedBy(
      service.createBlueprint(
        "bakery",
        { definition: { ...definition, copy: COPY, categoryKey: "nowhere" } },
        owner,
      ),
      /no category/,
    );
    await rejectedBy(
      service.createBlueprint(
        "barber",
        { definition: { ...definition, copy: COPY } },
        owner,
      ),
      /already/,
    );

    await service.createBlueprint(
      "bakery",
      { definition: { ...definition, copy: COPY } },
      owner,
    );
    expect((await live("bakery")).entry).toBeUndefined();
    expect((await service.readBlueprintsForAdmin(owner)).drafts).toContain("bakery");

    await service.publishBlueprintVersion("bakery", 1, owner);
    const bakery = await live("bakery");
    expect(bakery.offered).toBe(true);
    expect(bakery.entry?.definition.copy?.ar.name).toBe("مخبز");
  });

  it("hides an archived blueprint and every blueprint in a hidden category", async () => {
    await service.setBlueprintStatus("restaurant", "archived", owner);
    expect((await live("restaurant")).offered).toBe(false);
    await service.setBlueprintStatus("restaurant", "active", owner);
    expect((await live("restaurant")).offered).toBe(true);

    await service.saveCategory({ key: "food_hospitality", isActive: false }, owner);
    expect((await live("restaurant")).offered).toBe(false);
    expect((await live("bakery")).offered).toBe(false);
    await service.saveCategory({ key: "food_hospitality", isActive: true }, owner);
    expect((await live("restaurant")).offered).toBe(true);
  });

  it("requires names in every language for a new category", async () => {
    await rejectedBy(service.saveCategory({ key: "pets" }, owner), /en, fr, ar/);
    await service.saveCategory(
      { key: "pets", names: { en: "Pets", fr: "Animaux", ar: "الحيوانات الأليفة" } },
      owner,
    );
    const catalog = await service.loadBusinessCatalog();
    expect(
      catalog.categories.find((category) => category.key === "pets")?.names?.fr,
    ).toBe("Animaux");
  });

  it("knows which versions customers were actually offered", async () => {
    expect(await service.isKnownBlueprintVersion("barber", 0)).toBe(true);
    expect(await service.isKnownBlueprintVersion("barber", 1)).toBe(true);
    expect(await service.isKnownBlueprintVersion("barber", 99)).toBe(false);
    expect(await service.isKnownBlueprintVersion("bakery", 0)).toBe(false);
    expect(await service.isKnownBlueprintVersion("unheard_of", 0)).toBe(false);

    await service.saveBlueprintVersion(
      "photographer",
      { definition: (await live("photographer")).entry!.definition },
      owner,
    );
    // Saved, never published: nobody was shown it.
    expect(await service.isKnownBlueprintVersion("photographer", 1)).toBe(false);
  });
});

describe("an order that started from a blueprint", () => {
  function blueprintDraft(version: number) {
    const draft = draftFromBlueprint({
      blueprint: {
        key: "barber",
        version,
        categoryKey: "beauty_grooming",
        buildType: "website",
        recommended: ["home", "services", "contact"],
        optional: [],
        name: "Barber",
        summary: "",
      },
      details: {
        businessName: "Fade Street",
        location: "Laval",
        targetCustomers: "Students and office workers",
        offering: "Haircuts, beard trims and hot towel shaves, walk-ins and bookings.",
        goals: ["take_bookings"],
      },
      selected: ["home", "services", "contact"],
      locale: "en",
      goalSummary: "Take bookings",
    });
    return { ...draft, design: { ...draft.design, approach: "design_for_me" as const } };
  }

  it("keeps true provenance, priced by the engine like any other draft", async () => {
    const { createOrderFromDraft } = await import("@/server/commerce/orders");
    const result = await createOrderFromDraft(
      { rawDraft: blueprintDraft(1), clientRequestId: "req-blueprint-1" },
      customer,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [item] = await db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.orderId, result.value.order.id));
    const configuration = item!.configuration as {
      blueprint?: { key: string; version: number };
    };
    expect(configuration.blueprint).toMatchObject({ key: "barber", version: 1 });
    expect(result.value.order.totalMinorUnits).toBeGreaterThan(0);

    // Counted in the console once paid.
    await db
      .update(schema.orders)
      .set({ status: "paid" })
      .where(eq(schema.orders.id, result.value.order.id));
    const admin = await service.readBlueprintsForAdmin(owner);
    expect(admin.blueprints.find((entry) => entry.key === "barber")?.paidOrders).toBe(1);
  });

  it("drops a version nobody was offered rather than recording it", async () => {
    const { createOrderFromDraft } = await import("@/server/commerce/orders");
    const result = await createOrderFromDraft(
      { rawDraft: blueprintDraft(99), clientRequestId: "req-blueprint-forged" },
      customer,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [item] = await db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.orderId, result.value.order.id));
    expect((item!.configuration as { blueprint?: unknown }).blueprint).toBeUndefined();
  });
});
