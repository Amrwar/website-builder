import "server-only";

import { logger } from "@/lib/logger";
import { dueForRenewal } from "@/server/admin/launch-queries";
import { renew } from ".";

/**
 * The renewal sweep.
 *
 * Advances every subscription whose period has ended: renewing the ones still
 * running, retiring the ones that were cancelled, and granting each plan's
 * included credit for the new period.
 *
 * Deliberately **idempotent**. Each renewal is a conditional UPDATE on the
 * period it read, and each credit grant carries an idempotency key built from
 * the subscription and the period start. Running this twice in a minute
 * advances nothing twice and grants nothing twice -- which matters because a
 * scheduler that fires twice is a question of when, not if.
 *
 * It does **not** take payment. Billing is the payment provider's job and
 * arrives through a webhook; this moves our own record forward once a period
 * is over. Charging from a sweep would mean a retry could charge twice.
 *
 * Like the risk sweep before it, this has no scheduler yet. It is written,
 * tested and callable; wiring it to a cron is a deployment decision, and
 * saying so is better than implying something runs that does not.
 */

export interface SweepResult {
  examined: number;
  renewed: number;
  ended: number;
  failed: number;
}

export async function sweepRenewals(now: Date = new Date()): Promise<SweepResult> {
  const due = await dueForRenewal(now);

  const result: SweepResult = {
    examined: due.length,
    renewed: 0,
    ended: 0,
    failed: 0,
  };

  for (const subscription of due) {
    try {
      const outcome = await renew(subscription.id, now);

      if (!outcome.ok) {
        result.failed += 1;
        continue;
      }

      if (outcome.value.status === "cancelled") result.ended += 1;
      else result.renewed += 1;
    } catch (error) {
      // One bad subscription must not stop the rest of the sweep: the others
      // are customers whose service depends on their record moving forward.
      result.failed += 1;
      logger.error("renewal failed", { subscriptionId: subscription.id, error });
    }
  }

  if (result.examined > 0) {
    logger.info("renewal sweep complete", { ...result });
  }

  return result;
}
