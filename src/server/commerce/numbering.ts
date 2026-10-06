import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { documentCounters } from "@/db/schema";
import { formatDocumentNumber, type DocumentScope } from "@/config/commerce";

/**
 * Document numbering.
 *
 * Order and invoice numbers are year-scoped sequences allocated from a counter
 * row, not from a Postgres sequence. Sequences deliberately leak values on
 * rollback and under concurrency, and a gap in an invoice series is the kind of
 * thing a tax authority asks about.
 *
 * The allocation is a single upsert with an atomic increment, so two concurrent
 * callers serialise on the row rather than racing to read-then-write. Running
 * it inside the caller's transaction means a number is only consumed if the
 * document it belongs to is actually committed.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function nextDocumentNumber(
  tx: Tx,
  scope: DocumentScope,
  now: Date = new Date(),
): Promise<string> {
  const year = now.getUTCFullYear();

  const [row] = await tx
    .insert(documentCounters)
    .values({ scope, year, lastValue: 1 })
    .onConflictDoUpdate({
      target: [documentCounters.scope, documentCounters.year],
      set: {
        lastValue: sql`${documentCounters.lastValue} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ lastValue: documentCounters.lastValue });

  if (!row) {
    throw new Error(`Could not allocate a ${scope} number for ${year}.`);
  }

  return formatDocumentNumber(scope, year, row.lastValue);
}

/** Reads the current value without consuming one. For diagnostics only. */
export async function peekDocumentCounter(
  scope: DocumentScope,
  year: number,
): Promise<number> {
  const row = await db.query.documentCounters.findFirst({
    where: and(eq(documentCounters.scope, scope), eq(documentCounters.year, year)),
  });
  return row?.lastValue ?? 0;
}
