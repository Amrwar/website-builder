import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { orderItems, orders, products, scopeAssessments, type Order } from "@/db/schema";
import { platformConflict } from "@/config/platforms";
import { draftSchema, type ConfiguratorDraft } from "@/lib/configurator/draft";
import type { BuildType } from "@/config/products";
import { buildQuote, type Quote } from "@/lib/commerce/quote";
import { quoteCurrencyFor } from "@/lib/pricing/localize";
import { ApiError } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import { assessScope, type ScopeAssessment } from "@/lib/scope";
import { requireUser, type AuthContext } from "@/server/auth";
import { nextDocumentNumber } from "./numbering";

/**
 * Order creation.
 *
 * The rule this module exists to enforce: **the server decides the price.**
 * The client sends a configuration, never an amount. The configuration is
 * re-parsed, re-assessed and re-priced here, so the only thing a tampered
 * payload can achieve is to describe a different project -- which is then
 * priced correctly for what it describes.
 *
 * Creation is idempotent on `idempotencyKey`, enforced by a unique index
 * rather than a check-then-insert. A double-submitted form, a retried request
 * or an impatient second click all converge on one order.
 */

export interface CreateOrderInput {
  rawDraft: unknown;
  /**
   * Stable per checkout attempt, supplied by the client when it first sends
   * the customer towards payment. Two deliveries of the same attempt share it;
   * a genuine second purchase carries a new one.
   */
  clientRequestId: string;
}

export interface CreatedOrder {
  order: Order;
  quote: Quote;
  assessment: ScopeAssessment;
  /** True when an existing order was returned instead of a new one. */
  deduplicated: boolean;
}

export type CreateOrderResult =
  | { ok: true; value: CreatedOrder }
  | {
      ok: false;
      reason:
        "invalid_draft" | "invalid_platforms" | "requires_custom_quote" | "not_priceable";
    };

/** A uuid from the client, or a server-generated one when absent. */
function normaliseRequestId(value: string): string {
  return /^[0-9a-f-]{8,64}$/i.test(value) ? value : crypto.randomUUID();
}

function idempotencyKeyFor(userId: string, clientRequestId: string): string {
  return `order:${userId}:${normaliseRequestId(clientRequestId)}`;
}

async function loadByIdempotencyKey(key: string): Promise<Order | undefined> {
  return db.query.orders.findFirst({ where: eq(orders.idempotencyKey, key) });
}

/**
 * Re-assesses a draft and prices it.
 *
 * Shared by order creation and by the checkout preview, so the figure a
 * customer reviews and the figure they are charged come from one code path
 * rather than two that can drift.
 */
/** A draft that has passed validation, so its build type is settled. */
export type ConfiguredDraft = ConfiguratorDraft & { buildType: BuildType };

export async function priceDraft(
  draft: ConfiguredDraft,
  currency: ReturnType<typeof quoteCurrencyFor>,
): Promise<
  | { ok: true; assessment: ScopeAssessment; quote: Quote }
  | { ok: false; reason: "requires_custom_quote" | "not_priceable" }
> {
  const assessment = await assessScope({
    buildType: draft.buildType,
    ideaText: draft.intake.description,
    locale: draft.locale,
    selectedCapabilities: draft.selectedCapabilities,
    estimatedScreens: draft.estimatedScreens ?? undefined,
    platforms: draft.platforms,
    designApproach: draft.design.approach ?? undefined,
    context: {
      businessName: draft.intake.businessName,
      industry: draft.intake.industry,
      targetCustomers: draft.intake.targetCustomers,
      desiredOutcome: draft.intake.desiredOutcome,
    },
  });

  const quoted = buildQuote({
    assessment,
    currency,
    selectedCapabilities: draft.selectedCapabilities,
  });

  if (!quoted.ok) return { ok: false, reason: quoted.reason };
  return { ok: true, assessment, quote: quoted.quote };
}

export async function createOrderFromDraft(
  input: CreateOrderInput,
  context?: AuthContext,
): Promise<CreateOrderResult> {
  const auth = context ?? (await requireUser());
  const { user } = auth;

  const parsed = draftSchema.safeParse(input.rawDraft);
  if (!parsed.success || !parsed.data.buildType) {
    logger.warn("order rejected: draft failed validation", { userId: user.id });
    return { ok: false, reason: "invalid_draft" };
  }
  const draft = parsed.data as ConfiguredDraft;

  // Re-checked server-side. The configurator blocks this, but a disabled
  // button is a convenience, not a control.
  if (platformConflict(draft.buildType, draft.platforms) !== "none") {
    return { ok: false, reason: "invalid_platforms" };
  }

  const key = idempotencyKeyFor(user.id, input.clientRequestId);

  const existing = await loadByIdempotencyKey(key);
  if (existing) {
    const priced = await priceDraft(draft, existing.currency);
    if (!priced.ok) return { ok: false, reason: priced.reason };
    return {
      ok: true,
      value: {
        order: existing,
        quote: priced.quote,
        assessment: priced.assessment,
        deduplicated: true,
      },
    };
  }

  const currency = quoteCurrencyFor(user.preferredCurrency);
  const priced = await priceDraft(draft, currency);
  if (!priced.ok) {
    logger.info("order not created: no published price", {
      userId: user.id,
      reason: priced.reason,
    });
    return { ok: false, reason: priced.reason };
  }

  const { assessment, quote } = priced;

  try {
    const created = await db.transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, "order");

      const [order] = await tx
        .insert(orders)
        .values({
          number,
          ownerId: user.id,
          status: "draft",
          currency: quote.currency,
          subtotalMinorUnits: quote.subtotal.minorUnits,
          discountMinorUnits: quote.discount.minorUnits,
          taxMinorUnits: quote.tax.minorUnits,
          totalMinorUnits: quote.total.minorUnits,
          pricingSnapshot: quote.pricingSnapshot,
          locale: draft.locale,
          idempotencyKey: key,
          placedAt: new Date(),
        })
        .returning();

      if (!order) throw new Error("Order insert returned no row.");

      // The assessment is persisted append-only alongside the order, so the
      // reasoning behind the price survives independently of the snapshot.
      const [storedAssessment] = await tx
        .insert(scopeAssessments)
        .values({
          // No projectId: the project does not exist until the order is paid.
          source: "rule_engine",
          assessorId: assessment.assessorId,
          assessorVersion: assessment.assessorVersion,
          buildType: assessment.buildType,
          tier: assessment.tier,
          complexityPoints: assessment.complexityPoints,
          // Copied into mutable arrays: the assessment exposes them readonly,
          // which the column's declared jsonb type does not accept.
          capabilities: [...assessment.capabilities],
          reasons: [...assessment.reasons],
          requiresCustomQuote: assessment.requiresCustomQuote,
          priceMinorUnits: assessment.totalPrice?.minorUnits ?? null,
          currency: assessment.totalPrice?.currency ?? "CAD",
          guaranteedDays: assessment.guaranteedDays,
          inputSnapshot: draft,
        })
        .returning({ id: scopeAssessments.id });

      // Link each line to its catalogue row where one exists. The key is
      // snapshotted on the line regardless, so an order still reads correctly
      // if a product is later withdrawn.
      const catalogue = await tx
        .select({ id: products.id, key: products.key })
        .from(products)
        .where(
          inArray(
            products.key,
            quote.lines.map((line) => line.productKey),
          ),
        );
      const productIdByKey = new Map(catalogue.map((row) => [row.key, row.id]));

      await tx.insert(orderItems).values(
        quote.lines.map((line) => ({
          orderId: order.id,
          productId: productIdByKey.get(line.productKey) ?? null,
          productKey: line.productKey,
          productType: line.productType,
          productName: line.productName,
          quantity: line.quantity,
          configuration: line.productType === "build" ? draft : null,
          scopeAssessmentId: line.productType === "build" ? storedAssessment?.id : null,
          scopeTier: line.scopeTier ?? null,
          scopeSnapshot: line.productType === "build" ? assessment : null,
          selectedCapabilities: line.selectedCapabilities ?? [],
          unitAmountMinorUnits: line.unitAmount.minorUnits,
          discountMinorUnits: line.discount.minorUnits,
          taxMinorUnits: line.tax.minorUnits,
          totalMinorUnits: line.total.minorUnits,
          currency: line.unitAmount.currency,
          conversion: line.conversion,
          guaranteedDays: line.guaranteedDays ?? null,
        })),
      );

      return order;
    });

    logger.info("order created", {
      orderId: created.id,
      number: created.number,
      userId: user.id,
      total: created.totalMinorUnits,
      currency: created.currency,
    });

    return {
      ok: true,
      value: { order: created, quote, assessment, deduplicated: false },
    };
  } catch (error) {
    // The unique index on idempotency_key is the real guard: a concurrent
    // duplicate loses the race here and is handed the winner's order.
    const raced = await loadByIdempotencyKey(key);
    if (raced) {
      logger.info("order creation raced; returning the existing order", {
        orderId: raced.id,
      });
      return {
        ok: true,
        value: { order: raced, quote, assessment, deduplicated: true },
      };
    }
    throw error;
  }
}

/**
 * Loads an order the caller is allowed to see.
 *
 * Scoped by `ownerId` in the query itself rather than fetched and then
 * checked: a filter that is part of the SQL cannot be forgotten by a later
 * edit, and there is no window in which the row exists in memory unguarded.
 *
 * Staff with `project:read:all` may read any order; everyone else, only their
 * own. A caller asking for someone else's order gets `not_found`, not
 * `forbidden` -- the latter confirms it exists.
 */
export async function getOrderForCaller(number: string, context: AuthContext) {
  const canReadAll = context.can("project:read:all");

  const order = await db.query.orders.findFirst({
    where: canReadAll
      ? eq(orders.number, number)
      : and(eq(orders.number, number), eq(orders.ownerId, context.user.id)),
    with: { items: true },
  });

  if (!order) {
    throw new ApiError("not_found", "Not found.");
  }
  return order;
}
