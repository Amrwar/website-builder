import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Webhook defences.
 *
 * This endpoint marks orders paid and creates projects, and it is reachable by
 * anyone who finds the URL. Three things are therefore tested directly: that an
 * unsigned request gets nowhere, that a replayed delivery does no work twice,
 * and that a late failure event cannot undo a completed payment.
 */

const verifyWebhook = vi.fn();
const fulfilCheckout = vi.fn();
const markCheckoutUnsuccessful = vi.fn();

/** Whether the event-id insert wins the claim. False simulates a duplicate. */
let claimWins = true;
const eventInserts: Record<string, unknown>[] = [];
const paymentUpdates: Record<string, unknown>[] = [];

vi.mock("@/server/payments", () => ({
  paymentProvider: () => ({ id: "stripe", isConfigured: () => true, verifyWebhook }),
}));

vi.mock("@/server/commerce/fulfilment", () => ({
  fulfilCheckout: (...args: unknown[]) => fulfilCheckout(...args),
  markCheckoutUnsuccessful: (...args: unknown[]) => markCheckoutUnsuccessful(...args),
}));

vi.mock("@/db/client", () => ({
  db: {
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        eventInserts.push(values);
        return {
          onConflictDoNothing: () => ({
            returning: () => Promise.resolve(claimWins ? [{ id: "event-row" }] : []),
          }),
        };
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        paymentUpdates.push(values);
        return { where: () => Promise.resolve([]) };
      },
    }),
    query: {
      payments: {
        findFirst: () =>
          Promise.resolve({ id: "payment-1", orderId: "order-1", status: "initiated" }),
      },
    },
  },
}));

const { POST } = await import("./route");

function request(body: string, signature: string | null = "t=1,v1=abc") {
  return new Request("https://example.com/api/webhooks/stripe", {
    method: "POST",
    headers: signature ? { "stripe-signature": signature } : {},
    body,
  }) as unknown as Parameters<typeof POST>[0];
}

const ctx = { params: Promise.resolve({}) } as never;

beforeEach(() => {
  claimWins = true;
  eventInserts.length = 0;
  paymentUpdates.length = 0;
  verifyWebhook.mockReset();
  fulfilCheckout.mockReset();
  markCheckoutUnsuccessful.mockReset();
  fulfilCheckout.mockResolvedValue({
    ok: true,
    order: { id: "order-1" },
    projectId: "project-1",
    alreadyFulfilled: false,
  });
});

describe("an unverified request gets nowhere", () => {
  it("is rejected with 401 when the signature does not verify", async () => {
    const { PaymentProviderError } = await import("@/lib/payments/types");
    verifyWebhook.mockRejectedValue(new PaymentProviderError("stripe", "bad signature"));

    const response = await POST(request("{}"), ctx);

    expect(response.status).toBe(401);
    expect(fulfilCheckout).not.toHaveBeenCalled();
  });

  it("does not record an event for an unverified payload", async () => {
    const { PaymentProviderError } = await import("@/lib/payments/types");
    verifyWebhook.mockRejectedValue(new PaymentProviderError("stripe", "bad signature"));

    await POST(request("{}", null), ctx);

    expect(eventInserts).toHaveLength(0);
  });
});

describe("a replayed delivery does no work twice", () => {
  beforeEach(() => {
    verifyWebhook.mockResolvedValue({
      id: "evt_1",
      type: "checkout.session.completed",
      objectId: "cs_test_1",
      payload: { id: "evt_1" },
    });
  });

  it("fulfils on the first delivery", async () => {
    const response = await POST(request("{}"), ctx);

    expect(response.status).toBe(200);
    expect(fulfilCheckout).toHaveBeenCalledWith("cs_test_1", "stripe");
  });

  it("claims the event by its provider id", async () => {
    await POST(request("{}"), ctx);
    expect(eventInserts[0]?.providerEventId).toBe("evt_1");
  });

  it("acknowledges a duplicate without fulfilling again", async () => {
    // The unique constraint on the event id rejects the insert; losing that
    // claim is what makes a redelivery a no-op.
    claimWins = false;

    const response = await POST(request("{}"), ctx);
    const body = (await response.json()) as { data: { duplicate?: boolean } };

    expect(response.status).toBe(200);
    expect(body.data.duplicate).toBe(true);
    expect(fulfilCheckout).not.toHaveBeenCalled();
  });

  it("returns 200 on a duplicate, so the provider stops retrying", async () => {
    claimWins = false;
    const response = await POST(request("{}"), ctx);
    expect(response.status).toBe(200);
  });
});

describe("delayed payment methods", () => {
  it("fulfils on async_payment_succeeded as well as on completed", async () => {
    verifyWebhook.mockResolvedValue({
      id: "evt_2",
      type: "checkout.session.async_payment_succeeded",
      objectId: "cs_test_1",
      payload: {},
    });

    await POST(request("{}"), ctx);
    expect(fulfilCheckout).toHaveBeenCalledWith("cs_test_1", "stripe");
  });

  it("accepts a completed session whose money has not landed yet", async () => {
    // Not an error: the async_payment_succeeded event follows later.
    verifyWebhook.mockResolvedValue({
      id: "evt_3",
      type: "checkout.session.completed",
      objectId: "cs_test_1",
      payload: {},
    });
    fulfilCheckout.mockResolvedValue({ ok: false, reason: "unpaid" });

    const response = await POST(request("{}"), ctx);
    expect(response.status).toBe(200);
  });
});

describe("unsuccessful outcomes", () => {
  it("marks a failed payment and does not fulfil", async () => {
    verifyWebhook.mockResolvedValue({
      id: "evt_4",
      type: "checkout.session.async_payment_failed",
      objectId: "cs_test_1",
      payload: {},
    });

    await POST(request("{}"), ctx);

    expect(fulfilCheckout).not.toHaveBeenCalled();
    expect(markCheckoutUnsuccessful).toHaveBeenCalledWith("order-1", "failed");
    expect(paymentUpdates.some((u) => u.status === "failed")).toBe(true);
  });

  it("treats an expired checkout as cancelled, not as a lost customer", async () => {
    verifyWebhook.mockResolvedValue({
      id: "evt_5",
      type: "checkout.session.expired",
      objectId: "cs_test_1",
      payload: {},
    });

    await POST(request("{}"), ctx);

    expect(markCheckoutUnsuccessful).toHaveBeenCalledWith("order-1", "cancelled");
    expect(paymentUpdates.some((u) => u.status === "cancelled")).toBe(true);
  });
});

describe("events we do not act on", () => {
  it("are acknowledged rather than retried forever", async () => {
    verifyWebhook.mockResolvedValue({
      id: "evt_6",
      type: "payment_intent.created",
      objectId: "pi_1",
      payload: {},
    });

    const response = await POST(request("{}"), ctx);

    expect(response.status).toBe(200);
    expect(fulfilCheckout).not.toHaveBeenCalled();
  });
});
