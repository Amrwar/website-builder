// @vitest-environment node
import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The whole commercial lifecycle, against a real database.
 *
 * Postgres runs in-process (PGlite) with every migration applied, so the
 * constraints, triggers and enums are the production ones — including the
 * immutability and append-only triggers, which is the point: a mock database
 * would happily let the refund path write a column the trigger forbids.
 *
 * Only the external boundaries are replaced, and only at their seams:
 *   - Stripe: session lookup, webhook signature check, refund call.
 *   - Clerk: the session. Every server function here takes an explicit
 *     `AuthContext`, so the test acts as real users with real roles from
 *     the real permission matrix.
 *   - Next's request APIs, which do not exist outside a request.
 *
 * Everything else — the scope engine, pricing, order creation, the webhook
 * route handler itself, fulfilment, the event bus, notifications, the
 * guarantee clock, approvals, the launch gate, subscriptions, refunds — is the
 * code that ships.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));
/**
 * Quiet, except that errors are kept: several paths here deliberately swallow
 * a failure and log it so the triggering action still succeeds — which means a
 * broken notification or dispatch is invisible unless something reads the log.
 */
const logged = vi.hoisted(() => ({
  errors: [] as { message: string; context: unknown }[],
}));
vi.mock("@/lib/logger", () => {
  const quiet = {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn((message: string, context?: unknown) => {
      logged.errors.push({ message, context });
    }),
  };
  return { logger: { ...quiet, child: () => quiet } };
});

vi.mock("@/db/client", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@/db/schema");
  const client = new PGlite();
  (globalThis as Record<string, unknown>).__pglite = client;
  return { db: drizzle(client, { schema }) };
});

/** The fake Stripe. It records what it was asked so the test can check it. */
const stripe = vi.hoisted(() => {
  const state = {
    orderId: null as string | null,
    amountMinorUnits: 0,
    created: [] as unknown[],
    refunds: [] as { providerPaymentId: string; amountMinorUnits: number }[],
  };
  const provider = {
    id: "stripe" as const,
    isConfigured: () => true,
    createCheckout: async (input: {
      orderId: string;
      expectedTotalMinorUnits: number;
    }) => {
      state.orderId = input.orderId;
      state.amountMinorUnits = input.expectedTotalMinorUnits;
      state.created.push(input);
      return {
        providerReference: "cs_test_lifecycle",
        redirectUrl: "https://checkout.stripe.test/cs_test_lifecycle",
        expiresAt: null,
      };
    },
    retrieveCheckout: async (providerReference: string) => ({
      providerReference,
      status: "succeeded" as const,
      providerStatus: "paid",
      providerPaymentId: "pi_test_lifecycle",
      amountMinorUnits: state.amountMinorUnits,
      currency: "cad",
      orderId: state.orderId,
      customerEmail: "customer@example.test",
    }),
    // The real check is cryptographic; this one only insists a signature is
    // present, which is enough to prove the route refuses an unsigned body.
    verifyWebhook: async (rawBody: string, signature: string | null) => {
      if (!signature) {
        const { PaymentProviderError } = await import("@/lib/payments/types");
        throw new PaymentProviderError("stripe", "missing signature");
      }
      return JSON.parse(rawBody);
    },
    refund: async (input: { providerPaymentId: string; amountMinorUnits: number }) => {
      state.refunds.push(input);
      return {
        providerRefundId: `re_test_${state.refunds.length}`,
        amountMinorUnits: input.amountMinorUnits,
        status: "succeeded" as const,
      };
    },
  };
  return { state, provider };
});
vi.mock("@/server/payments", () => ({
  paymentProvider: () => stripe.provider,
  stripeProvider: stripe.provider,
}));

/** Clerk, replaced by whoever the test says is signed in. */
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/server/auth", async () => {
  const { roleHasPermission } = await import("@/config/roles");
  return {
    getAuthContext: async () => session.current,
    isSignedIn: async () => session.current !== null,
    requireUser: async () => {
      if (!session.current) throw new Error("not signed in");
      return session.current;
    },
    requirePermission: async (permission: string) => {
      const context = session.current as { can: (p: string) => boolean } | null;
      if (!context?.can(permission)) throw new Error("forbidden");
      return context;
    },
    assertOwnershipOr: () => {},
    contextFor: (user: { role: string }) => ({
      user,
      can: (p: string) => roleHasPermission(user.role as never, p as never),
    }),
  };
});

process.env.DATABASE_URL = "postgres://pglite.invalid/lifecycle";
process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://buildline.test";

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { roleHasPermission } = await import("@/config/roles");

type Context = import("@/server/auth").AuthContext;

function contextFor(user: typeof schema.users.$inferSelect): Context {
  return { user, can: (p) => roleHasPermission(user.role, p) };
}

async function makeUser(role: "customer" | "owner" | "finance", locale = "en") {
  const [user] = await db
    .insert(schema.users)
    .values({
      clerkUserId: `user_${role}_${Math.random().toString(36).slice(2)}`,
      email: `${role}@example.test`,
      displayName: role === "customer" ? "Amira Hassan" : `Test ${role}`,
      role,
      preferredLocale: locale,
    })
    .returning();
  return contextFor(user!);
}

const draft = {
  version: 1,
  // Configured in French: the order, its invoice and the notifications follow.
  locale: "fr",
  buildType: "website",
  intake: {
    businessName: "Cedar Bakery",
    industry: "Food",
    description: "A site for our bakery with our menu, opening hours and a contact form.",
    targetCustomers: "",
    desiredOutcome: "",
  },
  design: {
    approach: "supplied_brand",
    referenceLinks: [],
    colourNotes: "Warm cream and dark brown",
    brandNotes: "",
  },
  selectedCapabilities: [],
  platforms: ["responsive_web"],
  estimatedScreens: null,
};

let customer: Context;
let owner: Context;
let finance: Context;

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  await migrate(db as never, { migrationsFolder: "drizzle" });
  customer = await makeUser("customer", "fr");
  owner = await makeUser("owner");
  finance = await makeUser("finance");
}, 60_000);

async function stripeWebhook(event: unknown, signature: string | null = "t=1,v1=test") {
  const { POST } = await import("@/app/api/webhooks/stripe/route");
  const request = new Request("https://buildline.test/api/webhooks/stripe", {
    method: "POST",
    headers: signature ? { "stripe-signature": signature } : {},
    body: JSON.stringify(event),
  });
  return (POST as unknown as (r: Request) => Promise<Response>)(request);
}

const paidEvent = {
  id: "evt_test_paid",
  type: "checkout.session.completed",
  objectId: "cs_test_lifecycle",
  payload: {},
};

/* ------------------------------------------------------------------------ */

/**
 * Drizzle wraps a database error as "Failed query: …" with the trigger's own
 * message on `cause`. The assertion is about what the database said.
 */
async function rejectedBy(promise: Promise<unknown>, pattern: RegExp) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e as Error & { cause?: Error },
  );
  expect(error, "expected the database to refuse").not.toBeNull();
  expect(`${error!.message} ${error!.cause?.message ?? ""}`).toMatch(pattern);
}

describe("the commercial lifecycle, end to end", () => {
  let orderId = "";
  let orderNumber = "";
  let projectId = "";

  it("prices a configured draft and creates an order from it", async () => {
    session.current = customer;
    const { createOrderFromDraft } = await import("@/server/commerce/orders");
    const result = await createOrderFromDraft(
      { rawDraft: draft, clientRequestId: "req-lifecycle-1" },
      customer,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const order = await db.query.orders.findFirst({
      where: eq(schema.orders.id, result.value.order.id),
    });
    expect(order).toBeDefined();
    orderId = order!.id;
    orderNumber = order!.number;
    // The engine priced it; the browser did not.
    expect(order!.totalMinorUnits).toBeGreaterThan(0);
    expect(order!.status).toBe("draft");
  });

  it("starts a checkout and records the payment attempt", async () => {
    const { startCheckout } = await import("@/server/commerce/checkout");
    const result = await startCheckout({
      orderNumber,
      context: customer,
      origin: "https://buildline.test",
      locale: "fr",
    });
    expect(result.redirectUrl).toContain("checkout.stripe.test");
    // Stripe was asked for exactly the order's total.
    const order = await db.query.orders.findFirst({
      where: eq(schema.orders.id, orderId),
    });
    expect(stripe.state.amountMinorUnits).toBe(order!.totalMinorUnits);
  });

  it("refuses a webhook with no signature", async () => {
    const response = await stripeWebhook(paidEvent, null);
    expect(response.status).toBe(401);
  });

  it("fulfils a paid order through the real webhook route", async () => {
    const response = await stripeWebhook(paidEvent);
    expect(response.status).toBe(200);

    const order = await db.query.orders.findFirst({
      where: eq(schema.orders.id, orderId),
    });
    expect(order!.status).toBe("paid");
    expect(order!.projectId).toBeTruthy();
    projectId = order!.projectId!;
  });

  /**
   * Business rule 2: the guarantee countdown starts at `in_build`, never at
   * payment. The money is in; the clock is not running.
   */
  it("does not start the guarantee at payment", async () => {
    const project = await db.query.projects.findFirst({
      where: eq(schema.projects.id, projectId),
    });
    expect(project!.status).toBe("awaiting_assets");
    expect(project!.buildStartedAt).toBeNull();
    expect(project!.deadlineAt).toBeNull();
  });

  it("issues exactly one invoice, in the order's language, that cannot be edited", async () => {
    const invoices = await db.query.invoices.findMany({
      where: eq(schema.invoices.orderId, orderId),
    });
    expect(invoices).toHaveLength(1);
    const { resolveLocale } = await import("@/config/locales");
    expect(resolveLocale(invoices[0]!.locale)).toBe("fr");

    // The immutability trigger, against the real schema.
    await rejectedBy(
      db
        .update(schema.invoices)
        .set({ totalMinorUnits: 1 })
        .where(eq(schema.invoices.id, invoices[0]!.id)),
      /cannot be altered/,
    );
  });

  it("records the commerce fact on the bus and notifies in the customer's language", async () => {
    // Swallowed failures surface here rather than as a mysteriously empty table.
    expect(
      logged.errors.map(
        (e) =>
          `${e.message}: ${String((e.context as { error?: Error })?.error?.message ?? "")}`,
      ),
    ).toEqual([]);
    const fulfilled = await db.query.projectEvents.findMany({
      where: and(
        eq(schema.projectEvents.projectId, projectId),
        eq(schema.projectEvents.type, "order.fulfilled"),
      ),
    });
    expect(fulfilled).toHaveLength(1);

    const notes = await db.query.notifications.findMany({
      where: eq(schema.notifications.recipientId, customer.user.id),
    });
    const kinds = notes.map((n) => n.kind).sort();
    expect(kinds).toEqual(["invoice_issued", "order_paid"]);
    // Composed in the recipient's language, not the webhook's.
    for (const note of notes) expect(note.locale).toBe("fr");
  });

  it("does nothing twice when Stripe redelivers the webhook", async () => {
    const response = await stripeWebhook(paidEvent);
    expect(response.status).toBe(200);

    const projects = await db.query.projects.findMany({
      where: eq(schema.projects.ownerId, customer.user.id),
    });
    expect(projects).toHaveLength(1);
    const notes = await db.query.notifications.findMany({
      where: eq(schema.notifications.recipientId, customer.user.id),
    });
    expect(notes).toHaveLength(2);
  });

  it("refuses to start the build before the customer's assets are in", async () => {
    const { startBuild } = await import("@/server/workspace/lifecycle");
    const result = await startBuild(projectId, owner);
    expect(result).toMatchObject({ ok: false, reason: "no_assets" });
  });

  it("lets the customer submit assets once a file exists", async () => {
    await db.insert(schema.projectFiles).values({
      projectId,
      uploadedByUserId: customer.user.id,
      kind: "customer_upload",
      name: "logo.png",
      groupKey: "logo.png",
      pathname: `projects/${projectId}/logo.png`,
      contentType: "image/png",
      sizeBytes: 1024,
      visibility: "customer",
    } as never);

    const { submitAssets } = await import("@/server/workspace/lifecycle");
    const result = await submitAssets(projectId, customer);
    expect(result.ok).toBe(true);
  });

  it("does not let the customer start their own guarantee", async () => {
    const { startBuild } = await import("@/server/workspace/lifecycle");
    await expect(startBuild(projectId, customer)).rejects.toThrow();
  });

  it("starts the guarantee when staff start the build", async () => {
    const { startBuild } = await import("@/server/workspace/lifecycle");
    const result = await startBuild(projectId, owner);
    expect(result.ok).toBe(true);

    const project = await db.query.projects.findFirst({
      where: eq(schema.projects.id, projectId),
    });
    expect(project!.status).toBe("in_build");
    expect(project!.buildStartedAt).toBeInstanceOf(Date);
    expect(project!.deadlineAt!.getTime()).toBeGreaterThan(
      project!.buildStartedAt!.getTime(),
    );

    const started = await db.query.projectEvents.findFirst({
      where: and(
        eq(schema.projectEvents.projectId, projectId),
        eq(schema.projectEvents.type, "build.started"),
      ),
    });
    expect((started!.payload as { guaranteeStarted: boolean }).guaranteeStarted).toBe(
      true,
    );
  });

  it("refuses to rewrite the timeline", async () => {
    // The append-only trigger: the record a disputed guarantee is settled
    // against cannot be edited after the fact.
    await rejectedBy(
      db.execute(
        sql`update project_events set payload = '{}'::jsonb where project_id = ${projectId}`,
      ),
      /append-only/,
    );
  });

  it("publishes a preview", async () => {
    const { publishPreview } = await import("@/server/workspace/lifecycle");
    const result = await publishPreview(projectId, owner);
    expect(result.ok).toBe(true);
  });

  it("takes a change request from the customer and a decision from staff", async () => {
    const { requestChange, decideChangeRequest } =
      await import("@/server/workspace/collaboration");
    const change = await requestChange(
      projectId,
      { title: "Add a gallery", description: "A page with photos of the shop." },
      customer,
    );
    expect(change.status).toBe("submitted");

    const decided = await decideChangeRequest(
      change.id,
      "rejected",
      owner,
      "Out of scope.",
    );
    expect(decided.status).toBe("rejected");
  });

  it("lets only the customer approve what staff put up for approval", async () => {
    const { requestApproval, decideApproval } =
      await import("@/server/workspace/collaboration");
    const approval = await requestApproval(projectId, "preview", owner);

    // Staff approving on the customer's behalf would make the record
    // worthless as evidence.
    await expect(decideApproval(approval.id, "approved", owner)).rejects.toThrow();

    const decided = await decideApproval(approval.id, "approved", customer);
    expect(decided.status).toBe("approved");
  });

  it("refuses to launch while readiness checks are outstanding", async () => {
    const { launchProject } = await import("@/server/launch");
    const result = await launchProject(projectId, owner);
    expect(result.ok).toBe(false);

    const project = await db.query.projects.findFirst({
      where: eq(schema.projects.id, projectId),
    });
    expect(project!.launchedAt).toBeNull();
  });

  it("starts a maintenance plan, emitting its event against the project", async () => {
    const { startSubscription } = await import("@/server/subscriptions");
    const result = await startSubscription({ planKey: "essential", projectId }, customer);
    expect(result.ok).toBe(true);

    const event = await db.query.projectEvents.findFirst({
      where: and(
        eq(schema.projectEvents.projectId, projectId),
        eq(schema.projectEvents.type, "subscription.started"),
      ),
    });
    expect(event).toBeDefined();
  });

  /**
   * The Phase 14 fix, end to end: a plan bought without a project used to
   * record nothing at all.
   */
  it("records a plan bought without a project against the subscription", async () => {
    const other = await makeUser("customer");
    const { startSubscription } = await import("@/server/subscriptions");
    const result = await startSubscription({ planKey: "essential" }, other);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const event = await db.query.projectEvents.findFirst({
      where: and(
        eq(schema.projectEvents.subjectType, "subscription"),
        eq(schema.projectEvents.type, "subscription.started"),
      ),
    });
    expect(event).toBeDefined();
    expect(event!.projectId).toBeNull();
  });

  it("refunds through the provider with segregation of duties", async () => {
    const { requestRefund, executeRefund } = await import("@/server/admin/refunds");

    const refund = await requestRefund(
      { orderId, reason: "goodwill", amountMinorUnits: 1000, note: "Late reply." },
      finance,
    );

    // The person who asked for money to leave cannot also send it.
    await expect(executeRefund(refund.id, finance)).rejects.toThrow();

    const executed = await executeRefund(refund.id, owner);
    expect(executed.status).toBe("completed");
    expect(stripe.state.refunds.at(-1)).toMatchObject({
      providerPaymentId: "pi_test_lifecycle",
      amountMinorUnits: 1000,
    });

    // The paid order's refund columns are writable through the immutability
    // trigger; nothing else about it moved.
    const order = await db.query.orders.findFirst({
      where: eq(schema.orders.id, orderId),
    });
    expect(order!.refundedMinorUnits).toBe(1000);
    expect(order!.status).toBe("partially_refunded");
  });
});
