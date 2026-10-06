import "server-only";

import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import {
  launchChecklistItems,
  maintenancePlans,
  type LaunchChecklistItem,
  type MaintenancePlanRow,
} from "@/db/schema";
import { LAUNCH_CHECKLIST } from "@/config/launch";
import { MAINTENANCE_PLANS } from "@/config/maintenance";
import { CHECKLIST_GROUPS } from "@/db/schema/enums";
import { ApiError } from "@/lib/api/response";
import type { AuthContext } from "@/server/auth";
import { invalidateChecklistCache } from "@/server/launch/checklist";
import { invalidatePlanCache } from "@/server/subscriptions";
import { diffFields, recordAudit } from "./audit";

/**
 * Administering the post-launch catalogue.
 *
 * Maintenance plan prices and the launch checklist follow exactly the pattern
 * Phase 10 established for build pricing, and for the same reasons: the
 * shipped `config/` values are the seed and the fallback, only the owner may
 * write, and every change is audited so moving the rules out of version
 * control does not cost reviewability.
 *
 * The brief asked for both explicitly -- "do not hardcode the checklist into
 * UI" and "do not hardcode pricing" -- and the honest reading of both is that
 * they become data an administrator owns, not constants a developer owns.
 */

function requireSettings(context: AuthContext): void {
  if (!context.can("settings:manage")) {
    throw new ApiError("not_found", "Not found.");
  }
}

function requireRead(context: AuthContext): void {
  if (!context.can("finance:read") && !context.can("project:manage")) {
    throw new ApiError("not_found", "Not found.");
  }
}

function invalid(message: string): never {
  throw new ApiError("validation_failed", message);
}

export interface LifecycleCatalogView {
  plans: MaintenancePlanRow[];
  checklist: LaunchChecklistItem[];
  usingShippedDefaults: { plans: boolean; checklist: boolean };
}

export async function readLifecycleCatalog(
  context: AuthContext,
): Promise<LifecycleCatalogView> {
  requireRead(context);

  const [plans, checklist] = await Promise.all([
    db.select().from(maintenancePlans).orderBy(asc(maintenancePlans.sortOrder)),
    db.select().from(launchChecklistItems).orderBy(asc(launchChecklistItems.sortOrder)),
  ]);

  return {
    plans,
    checklist,
    usingShippedDefaults: {
      plans: plans.length === 0,
      checklist: checklist.length === 0,
    },
  };
}

/**
 * Copies the shipped plans and checklist into their tables.
 *
 * Refuses when rows already exist, for the same reason the pricing import
 * does: overwriting an administrator's edits with the shipped figures is a
 * destructive act disguised as a convenience.
 */
export async function importLifecycleDefaults(
  context: AuthContext,
): Promise<{ plans: number; checklist: number }> {
  requireSettings(context);

  const existing = await readLifecycleCatalog(context);
  const written = { plans: 0, checklist: 0 };

  await db.transaction(async (tx) => {
    if (existing.usingShippedDefaults.plans) {
      await tx.insert(maintenancePlans).values(
        MAINTENANCE_PLANS.map((plan, index) => ({
          key: plan.id,
          priceMinorUnits: plan.price.minorUnits,
          currency: plan.price.currency,
          interval: "monthly" as const,
          featureKeys: [...plan.featureKeys],
          includedCreditMinutes: plan.id === "priority" ? 120 : 0,
          trialDays: 0,
          isRecommended: plan.recommended,
          sortOrder: index,
        })),
      );
      written.plans = MAINTENANCE_PLANS.length;
    }

    if (existing.usingShippedDefaults.checklist) {
      await tx.insert(launchChecklistItems).values(
        LAUNCH_CHECKLIST.map((item, index) => ({
          key: item.key,
          group: item.group,
          translationKey: item.translationKey,
          appliesTo: [...item.appliesTo],
          isRequired: item.isRequired,
          customerVisible: item.customerVisible,
          sortOrder: index,
        })),
      );
      written.checklist = LAUNCH_CHECKLIST.length;
    }
  });

  if (written.plans + written.checklist === 0) {
    invalid("These have already been imported.");
  }

  invalidatePlanCache();
  invalidateChecklistCache();

  await recordAudit({
    category: "configuration",
    action: "lifecycle.imported_defaults",
    actor: context,
    subjectType: "catalog",
    subjectLabel: "Plans and launch checklist",
    after: written,
  });

  return written;
}

/* -------------------------------------------------------------------------
 * Maintenance plans
 * ---------------------------------------------------------------------- */

const planPatch = z.object({
  priceMinorUnits: z.number().int().positive(),
  includedCreditMinutes: z.number().int().min(0).max(10_000),
  trialDays: z.number().int().min(0).max(90),
  isRecommended: z.boolean(),
  isActive: z.boolean(),
});

export async function updatePlan(
  id: string,
  patch: unknown,
  context: AuthContext,
  reason?: string,
): Promise<MaintenancePlanRow> {
  requireSettings(context);

  const parsed = planPatch.safeParse(patch);
  if (!parsed.success) {
    invalid(parsed.error.issues[0]?.message ?? "That plan is not valid.");
  }

  const before = await db.query.maintenancePlans.findFirst({
    where: eq(maintenancePlans.id, id),
  });
  if (!before) throw new ApiError("not_found", "Not found.");

  const [after] = await db
    .update(maintenancePlans)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(maintenancePlans.id, id))
    .returning();

  if (!after) throw new ApiError("not_found", "Not found.");

  invalidatePlanCache();

  const diff = diffFields(before as unknown as Record<string, unknown>, parsed.data);
  if (diff) {
    await recordAudit({
      category: "configuration",
      action: "catalog.plan_updated",
      actor: context,
      subjectType: "maintenance_plan",
      subjectId: id,
      subjectLabel: before.key,
      before: diff.before,
      after: diff.after,
      reason: reason ?? null,
    });
  }

  // A price change never alters an existing subscription: the figure was
  // frozen on the row when it was bought, exactly as an order freezes a build
  // price. This edit decides what the next customer pays.
  return after;
}

/* -------------------------------------------------------------------------
 * The launch checklist
 * ---------------------------------------------------------------------- */

const checklistPatch = z.object({
  group: z.enum(CHECKLIST_GROUPS),
  isRequired: z.boolean(),
  customerVisible: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
  isActive: z.boolean(),
});

export async function updateChecklistItem(
  id: string,
  patch: unknown,
  context: AuthContext,
  reason?: string,
): Promise<LaunchChecklistItem> {
  requireSettings(context);

  const parsed = checklistPatch.safeParse(patch);
  if (!parsed.success) {
    invalid(parsed.error.issues[0]?.message ?? "That item is not valid.");
  }

  const before = await db.query.launchChecklistItems.findFirst({
    where: eq(launchChecklistItems.id, id),
  });
  if (!before) throw new ApiError("not_found", "Not found.");

  const [after] = await db
    .update(launchChecklistItems)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(launchChecklistItems.id, id))
    .returning();

  if (!after) throw new ApiError("not_found", "Not found.");

  invalidateChecklistCache();

  const diff = diffFields(before as unknown as Record<string, unknown>, parsed.data);
  if (diff) {
    await recordAudit({
      category: "configuration",
      action: "catalog.checklist_updated",
      actor: context,
      subjectType: "launch_checklist_item",
      subjectId: id,
      subjectLabel: before.key,
      before: diff.before,
      after: diff.after,
      reason: reason ?? null,
    });
  }

  return after;
}
