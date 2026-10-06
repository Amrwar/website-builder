import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { launchChecklistItems, projectLaunchChecks } from "@/db/schema";
import { LAUNCH_CHECKLIST, type LaunchChecklistDefinition } from "@/config/launch";
import type { ChecklistState } from "@/db/schema/enums";
import { ApiError } from "@/lib/api/response";
import type { ChecklistEntry } from "@/lib/launch/readiness";
import { logger } from "@/lib/logger";
import type { AuthContext } from "@/server/auth";

/**
 * The launch checklist.
 *
 * Definitions come from the database, falling back to the shipped list when
 * the table is empty -- the same pattern as the pricing catalogue, and for the
 * same reason: a launch has to work before anybody has opened an admin screen,
 * and a half-populated table must not produce a checklist with holes in it.
 *
 * What a launch requires is therefore configuration. The previous Build Room
 * hard-coded four steps in JSX, which made "analytics installed" a deployment
 * and a different checklist per product type impossible.
 */

const CACHE_MS = 30_000;
let cached: { at: number; items: readonly LaunchChecklistDefinition[] } | null = null;

export function invalidateChecklistCache(): void {
  cached = null;
}

/** The active definitions, in display order. */
export async function loadChecklistDefinitions(): Promise<
  readonly LaunchChecklistDefinition[]
> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.items;

  try {
    const rows = await db
      .select()
      .from(launchChecklistItems)
      .where(eq(launchChecklistItems.isActive, true))
      .orderBy(asc(launchChecklistItems.sortOrder));

    const items: readonly LaunchChecklistDefinition[] =
      rows.length === 0
        ? LAUNCH_CHECKLIST
        : rows.map((row) => ({
            key: row.key,
            group: row.group,
            translationKey: row.translationKey,
            appliesTo: row.appliesTo,
            isRequired: row.isRequired,
            customerVisible: row.customerVisible,
          }));

    cached = { at: Date.now(), items };
    return items;
  } catch (error) {
    // A checklist that cannot be read must not stop a launch being assessed.
    logger.error("launch checklist load failed; using shipped defaults", { error });
    return LAUNCH_CHECKLIST;
  }
}

/**
 * The checklist for one project, with each item's recorded state.
 *
 * Items with no row are pending. Rows are created lazily, when an item is
 * first acted on, so a project that nobody has touched costs nothing to store
 * and still reads correctly.
 *
 * `audience` filters to what a customer should see. Internal items -- "search
 * indexable", "backups running" -- are our own readiness and would read to a
 * customer as a list of things they have to do.
 */
export async function checklistForProject(
  projectId: string,
  productType: string,
  audience: "customer" | "staff",
): Promise<ChecklistEntry[]> {
  const [definitions, rows] = await Promise.all([
    loadChecklistDefinitions(),
    db
      .select()
      .from(projectLaunchChecks)
      .where(eq(projectLaunchChecks.projectId, projectId)),
  ]);

  const byKey = new Map(rows.map((row) => [row.itemKey, row]));

  return definitions
    .filter((item) => item.appliesTo.length === 0 || item.appliesTo.includes(productType))
    .filter((item) => audience === "staff" || item.customerVisible)
    .map((item) => {
      const row = byKey.get(item.key);
      return {
        item,
        state: row?.state ?? ("pending" as ChecklistState),
        note: row?.note ?? null,
        completedAt: row?.completedAt ?? null,
      };
    });
}

export type ChecklistRefusal = "unknown_item" | "note_required" | "not_applicable_item";

export type ChecklistUpdate = { ok: true } | { ok: false; reason: ChecklistRefusal };

/**
 * Records an item's state.
 *
 * Requires `build:execute`. A customer cannot tick their own launch items:
 * the checklist is partly our assertion that the work is done, and letting the
 * person waiting for it mark it complete would make the whole thing
 * decorative. What a customer *can* do is approve the preview, which is a
 * separate, signed act.
 *
 * Marking an item not applicable requires a note, in the application and again
 * in the database. "This does not apply" with no reason is indistinguishable
 * from skipping something awkward.
 */
export async function setChecklistState(
  input: {
    projectId: string;
    itemKey: string;
    state: ChecklistState;
    note?: string | null;
  },
  context: AuthContext,
): Promise<ChecklistUpdate> {
  if (!context.can("build:execute")) {
    throw new ApiError("not_found", "Not found.");
  }

  const definitions = await loadChecklistDefinitions();
  const item = definitions.find((entry) => entry.key === input.itemKey);
  if (!item) return { ok: false, reason: "unknown_item" };

  const note = input.note?.trim() || null;
  if (input.state === "not_applicable" && !note) {
    return { ok: false, reason: "note_required" };
  }

  const done = input.state === "pending" ? null : new Date();

  await db
    .insert(projectLaunchChecks)
    .values({
      projectId: input.projectId,
      itemKey: input.itemKey,
      state: input.state,
      note,
      completedByUserId: done ? context.user.id : null,
      completedAt: done,
    })
    .onConflictDoUpdate({
      target: [projectLaunchChecks.projectId, projectLaunchChecks.itemKey],
      set: {
        state: input.state,
        note,
        completedByUserId: done ? context.user.id : null,
        completedAt: done,
        updatedAt: new Date(),
      },
    });

  return { ok: true };
}
