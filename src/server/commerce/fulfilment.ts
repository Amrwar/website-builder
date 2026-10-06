import "server-only";

import { and, eq, ne } from "drizzle-orm";

import { INVOICE_DUE_DAYS, TAX } from "@/config/commerce";
import { db } from "@/db/client";
import {
  invoices,
  orders,
  projectBriefs,
  projectEvents,
  projects,
  scopeAssessments,
  users,
  type Order,
} from "@/db/schema";
import type { ConfiguratorDraft } from "@/lib/configurator/draft";
import { logger } from "@/lib/logger";
import { paymentProvider } from "@/server/payments";
import { nextDocumentNumber } from "./numbering";

/**
 * Fulfilment.
 *
 * Turning a paid checkout into a project and an invoice. Three properties
 * matter, and each is enforced structurally rather than by convention:
 *
 * **1. It is authoritative.** The payment state is read back from the provider,
 * never taken from the browser. A customer landing on the success page with a
 * hand-edited URL proves nothing; the provider's own record of the session is
 * the only thing consulted.
 *
 * **2. It is idempotent and concurrency-safe.** Stripe states plainly that this
 * function can be called multiple times, possibly concurrently, for the same
 * session -- the webhook and the landing page routinely race. The claim is a
 * single conditional UPDATE: the first caller to move the order out of its
 * pre-paid state wins and does the work; everyone else gets the finished
 * result. No check-then-act, no advisory lock, no window.
 *
 * **3. It does not start the guarantee clock.** The project is created in
 * `awaiting_assets`, with `buildStartedAt` and `deadlineAt` left null. Payment
 * buys a place in the queue; the countdown begins only once the customer's
 * assets are in and the build officially starts, which is Phase 7's work.
 */

export type FulfilmentOutcome =
  | { ok: true; order: Order; projectId: string; alreadyFulfilled: boolean }
  | {
      ok: false;
      reason: "unknown_session" | "unpaid" | "order_missing" | "amount_mismatch";
    };

/**
 * Fulfils the order behind a provider checkout reference.
 *
 * Safe to call from the webhook, from the landing page, and from both at once.
 */
export async function fulfilCheckout(
  providerReference: string,
  providerId = "stripe",
): Promise<FulfilmentOutcome> {
  const provider = paymentProvider(providerId);

  const state = await provider.retrieveCheckout(providerReference);
  if (!state.orderId) {
    logger.warn("fulfilment: checkout carries no order id", { providerReference });
    return { ok: false, reason: "unknown_session" };
  }

  // Stripe's guidance is to gate on payment_status, not on the session being
  // "complete": a delayed payment method completes the session while the money
  // is still in flight, and building for it would be building unpaid work.
  if (state.status !== "succeeded") {
    logger.info("fulfilment skipped: not paid", {
      providerReference,
      status: state.status,
    });
    return { ok: false, reason: "unpaid" };
  }

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, state.orderId),
    with: { items: true },
  });
  if (!order) {
    logger.error("fulfilment: order referenced by checkout does not exist", {
      providerReference,
      orderId: state.orderId,
    });
    return { ok: false, reason: "order_missing" };
  }

  // The provider is the authority on what was collected. A mismatch means the
  // session was not created from this order's totals, so it is refused rather
  // than fulfilled for a number nobody authorised.
  if (state.amountMinorUnits !== order.totalMinorUnits) {
    logger.error("fulfilment refused: charged amount does not match the order", {
      orderId: order.id,
      charged: state.amountMinorUnits,
      expected: order.totalMinorUnits,
    });
    return { ok: false, reason: "amount_mismatch" };
  }

  if (order.projectId && order.status === "paid") {
    return { ok: true, order, projectId: order.projectId, alreadyFulfilled: true };
  }

  const now = new Date();

  const result = await db.transaction(async (tx) => {
    // The claim. Exactly one caller can move an order out of a pre-paid state,
    // so exactly one caller creates the project and the invoice.
    const [claimed] = await tx
      .update(orders)
      .set({ status: "paid", paidAt: now, updatedAt: now })
      .where(and(eq(orders.id, order.id), ne(orders.status, "paid")))
      .returning();

    if (!claimed) return null;

    const owner = await tx.query.users.findFirst({ where: eq(users.id, order.ownerId) });
    if (!owner) throw new Error(`Order ${order.id} has no owner row.`);

    const buildLine = order.items.find((item) => item.productType === "build");
    const reference = await nextDocumentNumber(tx, "project", now);

    const [project] = await tx
      .insert(projects)
      .values({
        reference,
        ownerId: order.ownerId,
        buildType: buildLine?.scopeSnapshot
          ? (buildLine.scopeSnapshot as { buildType: "website" | "system" | "mobileApp" })
              .buildType
          : "website",
        scopeTier: buildLine?.scopeTier ?? null,
        // Paid, but NOT started. The countdown does not run in this state.
        status: "awaiting_assets",
        priceMinorUnits: order.totalMinorUnits,
        currency: order.currency,
        guaranteedDays: buildLine?.guaranteedDays ?? null,
        paidAt: now,
        // assetsSubmittedAt, buildStartedAt and deadlineAt stay null on
        // purpose. Setting any of them here would start the guarantee at
        // checkout, which is the one thing this lifecycle must never do.
      })
      .returning();

    if (!project) throw new Error("Project insert returned no row.");

    const draft = buildLine?.configuration as ConfiguratorDraft | null | undefined;
    if (draft) {
      await tx.insert(projectBriefs).values({
        projectId: project.id,
        ideaText: draft.intake.description,
        ideaLocale: draft.locale,
        selectedCapabilities: [...draft.selectedCapabilities],
        designApproach: draft.design.approach ?? null,
        estimatedScreens: draft.estimatedScreens ?? null,
        referenceUrls: draft.design.referenceLinks.filter(Boolean),
      });
    }

    // Attach the assessment that priced the order to the project it produced,
    // so the project's own history starts with the reasoning behind its price.
    if (buildLine?.scopeAssessmentId) {
      await tx
        .update(scopeAssessments)
        .set({ projectId: project.id })
        .where(eq(scopeAssessments.id, buildLine.scopeAssessmentId));
    }

    await tx
      .update(orders)
      .set({ projectId: project.id, updatedAt: now })
      .where(eq(orders.id, order.id));

    const invoiceNumber = await nextDocumentNumber(tx, "invoice", now);
    await tx.insert(invoices).values({
      number: invoiceNumber,
      orderId: order.id,
      ownerId: order.ownerId,
      status: "paid",
      billToName: owner.displayName ?? owner.email,
      billToEmail: owner.email,
      billToOrganization: owner.businessName,
      billToCountry: owner.billingCountry,
      billToTaxId: owner.taxId,
      currency: order.currency,
      subtotalMinorUnits: order.subtotalMinorUnits,
      discountMinorUnits: order.discountMinorUnits,
      taxMinorUnits: order.taxMinorUnits,
      totalMinorUnits: order.totalMinorUnits,
      taxRateBasisPoints: TAX.enabled ? TAX.rateBasisPoints : 0,
      taxNote: TAX.enabled ? null : TAX.noteKey,
      lineItems: order.items.map((item) => ({
        productKey: item.productKey,
        productName: item.productName,
        quantity: item.quantity,
        unitAmountMinorUnits: item.unitAmountMinorUnits,
        taxMinorUnits: item.taxMinorUnits,
        totalMinorUnits: item.totalMinorUnits,
      })),
      locale: order.locale,
      issuedAt: now,
      dueAt: new Date(now.getTime() + INVOICE_DUE_DAYS * 86_400_000),
      paidAt: now,
    });

    await tx.insert(projectEvents).values({
      projectId: project.id,
      type: "order.fulfilled",
      actorType: "system",
      payload: {
        orderId: order.id,
        orderNumber: order.number,
        invoiceNumber,
        providerReference,
        // Stated explicitly in the audit trail, because this is the fact a
        // future deadline dispute turns on.
        guaranteeStarted: false,
      },
    });

    return { order: claimed, projectId: project.id };
  });

  if (!result) {
    // Another caller won the claim. Read back what they produced rather than
    // reporting a failure: the work is done, just not by us.
    const settled = await db.query.orders.findFirst({ where: eq(orders.id, order.id) });
    if (settled?.projectId) {
      return {
        ok: true,
        order: settled,
        projectId: settled.projectId,
        alreadyFulfilled: true,
      };
    }
    logger.warn(
      "fulfilment: claim lost but no project found; the winner may still be committing",
      {
        orderId: order.id,
      },
    );
    return { ok: false, reason: "unpaid" };
  }

  logger.info("order fulfilled", {
    orderId: result.order.id,
    orderNumber: result.order.number,
    projectId: result.projectId,
  });

  return {
    ok: true,
    order: result.order,
    projectId: result.projectId,
    alreadyFulfilled: false,
  };
}

/** Marks an order as failed or cancelled. Never downgrades a paid order. */
export async function markCheckoutUnsuccessful(
  orderId: string,
  outcome: "failed" | "cancelled",
): Promise<void> {
  const now = new Date();
  await db
    .update(orders)
    .set({
      status: outcome,
      ...(outcome === "cancelled" ? { cancelledAt: now } : {}),
      updatedAt: now,
    })
    // A late failure event must not undo a payment that already succeeded;
    // provider events are explicitly not ordered.
    .where(and(eq(orders.id, orderId), ne(orders.status, "paid")));
}
