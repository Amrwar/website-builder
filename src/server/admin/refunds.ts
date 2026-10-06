import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { MISSED_DEADLINE_REFUND } from "@/config/brand";
import { db } from "@/db/client";
import { orders, payments, projects, refunds, type Refund } from "@/db/schema";
import type { RefundReason } from "@/db/schema/enums";
import { ApiError } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import { percentOf, money, type Money } from "@/lib/pricing/money";
import type { AuthContext } from "@/server/auth";
import { paymentProvider } from "@/server/payments";
import { recordAudit } from "./audit";

/**
 * Refunds.
 *
 * Two acts by two roles. Finance (or anyone with `billing:manage`) **requests**
 * a refund; only `refund:execute` -- owner or administrator -- approves and
 * releases it. Nothing in the browser decides either: the amount is computed
 * server-side from the order and the guarantee rules, and the approving role
 * is read from the database, never from the request.
 *
 * The requester cannot approve their own request. That is the control the
 * whole two-state design exists for, and removing it would make this table a
 * more elaborate way of doing nothing.
 */

export interface RefundEligibility {
  eligible: boolean;
  /** The maximum that may be refunded, after what has already gone back. */
  maximum: Money;
  alreadyRefunded: Money;
  /** Suggested amounts for the two guarantee outcomes, when they apply. */
  guarantee: {
    deadlineMissed: boolean;
    cancelAmount: Money | null;
    continueAmount: Money | null;
  };
  reasons: string[];
}

/**
 * What may be refunded on an order, and why.
 *
 * The guarantee amounts are derived from the order total and the published
 * percentages, not typed in by whoever is processing it -- the customer was
 * promised 100% or 30%, and a hand-entered figure is how that promise quietly
 * becomes 28%.
 */
export async function refundEligibility(
  orderId: string,
  context: AuthContext,
  now: Date = new Date(),
): Promise<RefundEligibility> {
  if (!context.can("billing:manage")) throw new ApiError("not_found", "Not found.");

  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) throw new ApiError("not_found", "Not found.");

  const currency = order.currency;
  const total = money(order.totalMinorUnits, currency);
  const alreadyRefunded = money(order.refundedMinorUnits, currency);
  const maximum = money(
    Math.max(0, order.totalMinorUnits - order.refundedMinorUnits),
    currency,
  );

  const reasons: string[] = [];
  if (order.status !== "paid" && order.status !== "completed") {
    reasons.push("order_not_paid");
  }
  if (maximum.minorUnits === 0) reasons.push("fully_refunded");

  const project = order.projectId
    ? await db.query.projects.findFirst({ where: eq(projects.id, order.projectId) })
    : undefined;

  const deadlineMissed = Boolean(
    project?.deadlineAt &&
    now.getTime() > project.deadlineAt.getTime() &&
    !project.deliveredAt,
  );

  return {
    eligible: reasons.length === 0,
    maximum,
    alreadyRefunded,
    guarantee: {
      deadlineMissed,
      cancelAmount: deadlineMissed
        ? percentOf(total, MISSED_DEADLINE_REFUND.cancelPercent)
        : null,
      continueAmount: deadlineMissed
        ? percentOf(total, MISSED_DEADLINE_REFUND.continuePercent)
        : null,
    },
    reasons,
  };
}

export interface RequestRefundInput {
  orderId: string;
  reason: RefundReason;
  /** Omitted for guarantee reasons, where the amount is derived. */
  amountMinorUnits?: number;
  note?: string;
}

/**
 * Raises a refund request. Moves no money.
 *
 * For the two guarantee outcomes the amount is computed from the published
 * percentages and any supplied figure is ignored, so the customer gets exactly
 * what they were promised.
 */
export async function requestRefund(
  input: RequestRefundInput,
  context: AuthContext,
): Promise<Refund> {
  if (!context.can("billing:manage")) throw new ApiError("not_found", "Not found.");

  const eligibility = await refundEligibility(input.orderId, context);
  if (!eligibility.eligible) {
    throw new ApiError("conflict", "This order cannot be refunded.");
  }

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, input.orderId),
  });
  if (!order) throw new ApiError("not_found", "Not found.");

  const total = money(order.totalMinorUnits, order.currency);

  // Guarantee amounts are derived, never accepted from the caller.
  let amount: Money;
  if (input.reason === "guarantee_cancel") {
    amount = percentOf(total, MISSED_DEADLINE_REFUND.cancelPercent);
  } else if (input.reason === "guarantee_continue") {
    amount = percentOf(total, MISSED_DEADLINE_REFUND.continuePercent);
  } else {
    const requested = Math.floor(input.amountMinorUnits ?? 0);
    if (!Number.isInteger(requested) || requested <= 0) {
      throw new ApiError("bad_request", "Enter an amount to refund.");
    }
    amount = money(requested, order.currency);
  }

  if (amount.minorUnits > eligibility.maximum.minorUnits) {
    throw new ApiError("bad_request", "That is more than remains on this order.");
  }
  if (input.reason === "other" && !input.note?.trim()) {
    throw new ApiError("bad_request", "Give a reason for this refund.");
  }

  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(refunds);

  const [created] = await db
    .insert(refunds)
    .values({
      reference: `REF-${new Date().getUTCFullYear()}-${String(n + 1).padStart(4, "0")}`,
      orderId: order.id,
      status: "requested",
      reason: input.reason,
      note: input.note?.trim().slice(0, 1000) ?? null,
      amountMinorUnits: amount.minorUnits,
      currency: order.currency,
      requestedByUserId: context.user.id,
    })
    .returning();

  if (!created) throw new Error("Refund insert returned no row.");

  await recordAudit({
    category: "finance",
    action: "refund.requested",
    actor: context,
    subjectType: "refund",
    subjectId: created.id,
    subjectLabel: created.reference,
    after: {
      orderNumber: order.number,
      amountMinorUnits: amount.minorUnits,
      currency: order.currency,
      reason: input.reason,
    },
    reason: input.note ?? null,
  });

  logger.info("refund requested", {
    refundId: created.id,
    orderId: order.id,
    amount: amount.minorUnits,
  });

  return created;
}

/**
 * Approves and sends the money.
 *
 * Requires `refund:execute`, which finance deliberately does not hold, and
 * refuses when the approver is the requester. Those two rules together are the
 * segregation of duties; either alone is decoration.
 *
 * The provider call happens after the state is claimed, so a crash mid-flight
 * leaves a refund marked `processing` to reconcile rather than one that is
 * `requested` while the money has already gone.
 */
export async function executeRefund(
  refundId: string,
  context: AuthContext,
): Promise<Refund> {
  if (!context.can("refund:execute")) {
    // not_found rather than forbidden: finance probing this endpoint learns
    // nothing about whether it exists.
    throw new ApiError("not_found", "Not found.");
  }

  const refund = await db.query.refunds.findFirst({ where: eq(refunds.id, refundId) });
  if (!refund) throw new ApiError("not_found", "Not found.");

  if (refund.status !== "requested" && refund.status !== "approved") {
    throw new ApiError("conflict", "This refund has already been handled.");
  }

  if (refund.requestedByUserId === context.user.id) {
    await recordAudit({
      category: "finance",
      action: "refund.execute_refused",
      actor: context,
      subjectType: "refund",
      subjectId: refund.id,
      subjectLabel: refund.reference,
      after: { refusal: "self_approval" },
    });
    throw new ApiError(
      "forbidden",
      "A refund must be approved by someone other than the person who raised it.",
    );
  }

  const now = new Date();

  // Claim it. A second approver loses the race and gets a conflict rather than
  // a second transfer.
  const [claimed] = await db
    .update(refunds)
    .set({
      status: "processing",
      approvedByUserId: context.user.id,
      approvedAt: now,
      updatedAt: now,
    })
    .where(and(eq(refunds.id, refundId), eq(refunds.status, refund.status)))
    .returning();

  if (!claimed) throw new ApiError("conflict", "This refund has already been handled.");

  const payment = await db.query.payments.findFirst({
    where: and(eq(payments.orderId, refund.orderId), eq(payments.status, "succeeded")),
    orderBy: desc(payments.succeededAt),
  });

  try {
    if (!payment?.providerPaymentId) {
      throw new Error("No settled payment to refund against.");
    }

    const result = await paymentProvider(payment.provider).refund({
      providerPaymentId: payment.providerPaymentId,
      amountMinorUnits: refund.amountMinorUnits,
      idempotencyKey: `refund:${refund.id}`,
      reason: "requested_by_customer",
    });

    const [completed] = await db
      .update(refunds)
      .set({
        status: "completed",
        providerRefundId: result.providerRefundId,
        paymentId: payment.id,
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(refunds.id, refundId))
      .returning();

    await db
      .update(orders)
      .set({
        refundedMinorUnits: sql`${orders.refundedMinorUnits} + ${refund.amountMinorUnits}`,
        status: sql`case when ${orders.totalMinorUnits} <= ${orders.refundedMinorUnits} + ${refund.amountMinorUnits} then 'refunded'::order_status else 'partially_refunded'::order_status end`,
        refundedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, refund.orderId));

    await recordAudit({
      category: "finance",
      action: "refund.executed",
      actor: context,
      subjectType: "refund",
      subjectId: refund.id,
      subjectLabel: refund.reference,
      before: { status: refund.status },
      after: {
        status: "completed",
        amountMinorUnits: refund.amountMinorUnits,
        providerRefundId: result.providerRefundId,
      },
    });

    logger.warn("refund executed", {
      refundId: refund.id,
      amount: refund.amountMinorUnits,
      approverId: context.user.id,
    });

    return completed ?? claimed;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";

    await db
      .update(refunds)
      .set({ status: "failed", failureReason: message, updatedAt: new Date() })
      .where(eq(refunds.id, refundId));

    await recordAudit({
      category: "finance",
      action: "refund.failed",
      actor: context,
      subjectType: "refund",
      subjectId: refund.id,
      subjectLabel: refund.reference,
      after: { error: message },
    });

    logger.error("refund failed", { refundId: refund.id, error });
    throw new ApiError("service_unavailable", "The refund could not be processed.");
  }
}

/** Declines a request without moving money. */
export async function rejectRefund(
  refundId: string,
  note: string,
  context: AuthContext,
): Promise<Refund> {
  if (!context.can("refund:execute")) throw new ApiError("not_found", "Not found.");

  const trimmed = note.trim();
  if (trimmed === "") throw new ApiError("bad_request", "Say why it is being declined.");

  const [updated] = await db
    .update(refunds)
    .set({
      status: "rejected",
      rejectedAt: new Date(),
      rejectionNote: trimmed.slice(0, 1000),
      approvedByUserId: context.user.id,
      updatedAt: new Date(),
    })
    .where(and(eq(refunds.id, refundId), eq(refunds.status, "requested")))
    .returning();

  if (!updated) throw new ApiError("conflict", "This refund has already been handled.");

  await recordAudit({
    category: "finance",
    action: "refund.rejected",
    actor: context,
    subjectType: "refund",
    subjectId: refundId,
    subjectLabel: updated.reference,
    after: { status: "rejected" },
    reason: trimmed,
  });

  return updated;
}
