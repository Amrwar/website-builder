import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { invoices, orders } from "@/db/schema";
import { ApiError } from "@/lib/api/response";
import type { AuthContext } from "@/server/auth";

/**
 * The frozen line items, validated on read.
 *
 * The column is `jsonb`, so what comes back is whatever was written -- which
 * for rows issued before `translationKey` existed is a line without one. A
 * financial document is the wrong place to discover that at render time, so
 * the shape is parsed and a line that does not fit is dropped rather than
 * crashing the page: the totals are stored separately and remain correct.
 */
const lineSchema = z.object({
  productKey: z.string(),
  productName: z.string(),
  translationKey: z.string().nullish(),
  scopeTier: z.string().nullish(),
  quantity: z.number().int().positive(),
  unitAmountMinorUnits: z.number().int(),
  taxMinorUnits: z.number().int(),
  totalMinorUnits: z.number().int(),
});

export type InvoiceLine = z.infer<typeof lineSchema>;

export function parseInvoiceLines(value: unknown): InvoiceLine[] {
  const parsed = z.array(lineSchema).safeParse(value);
  if (parsed.success) return parsed.data;

  // Salvage what is readable. An invoice that renders six of seven lines and
  // a correct total is more use to a customer than a 500.
  if (!Array.isArray(value)) return [];
  return value.flatMap((line) => {
    const one = lineSchema.safeParse(line);
    return one.success ? [one.data] : [];
  });
}

/**
 * Loads an invoice the caller is allowed to see, with the order it belongs to.
 *
 * Scoped by `ownerId` in the SQL rather than fetched and then checked, for the
 * same reason as `getOrderForCaller`: a filter in the query cannot be dropped
 * by a later edit. `finance:read` staff may read any invoice; everyone else,
 * only their own, and asking for someone else's answers `not_found` rather
 * than `forbidden`, which would confirm the number exists.
 */
export async function getInvoiceForCaller(number: string, context: AuthContext) {
  const canReadAll = context.can("finance:read");

  const invoice = await db.query.invoices.findFirst({
    where: canReadAll
      ? eq(invoices.number, number)
      : and(eq(invoices.number, number), eq(invoices.ownerId, context.user.id)),
  });

  if (!invoice) throw new ApiError("not_found", "Not found.");

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, invoice.orderId),
    columns: { number: true, projectId: true },
  });

  return {
    invoice,
    lines: parseInvoiceLines(invoice.lineItems),
    orderNumber: order?.number ?? null,
    projectId: order?.projectId ?? null,
  };
}

export type InvoiceForCaller = Awaited<ReturnType<typeof getInvoiceForCaller>>;
