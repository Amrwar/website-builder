import "server-only";

import { db } from "@/db/client";
import { projectEvents } from "@/db/schema";
import {
  PRIVILEGED_EVENTS,
  EVENT_PAYLOAD_VERSION,
  type DomainEvent,
  type DomainEventName,
  type DomainEventPayloads,
  type EventHandler,
} from "@/lib/events/catalogue";
import { logger } from "@/lib/logger";

/**
 * The event bus.
 *
 * One way into the audit trail, and one place subscribers attach. Writing
 * `project_events` directly still works and is not forbidden, but anything
 * that should be *observable* goes through here.
 *
 * Two deliberate properties:
 *
 * **Persist first, dispatch second.** The row is written before any handler
 * runs, so a handler that throws cannot erase the fact that the thing
 * happened. The audit trail is the product of record; subscribers are
 * downstream of it.
 *
 * **A failing handler never fails the emitter.** Each is isolated and its
 * error logged. A broken notification must not roll back a completed build
 * step -- that would make adding a subscriber a risk to the core workflow,
 * which is precisely what an event system exists to avoid.
 *
 * Dispatch is synchronous and in-process today. The handler signature is
 * already async and void-returning, so moving to a durable queue is a change
 * inside this file rather than across every subscriber.
 */

type HandlerEntry = {
  name: string;
  handler: EventHandler<DomainEventName>;
};

const subscribers = new Map<DomainEventName, HandlerEntry[]>();

/**
 * Registers a subscriber.
 *
 * `name` is required and appears in logs, because an anonymous handler that
 * throws at three in the morning is nearly impossible to place.
 */
export function subscribe<N extends DomainEventName>(
  eventName: N,
  name: string,
  handler: EventHandler<N>,
): void {
  const entry: HandlerEntry = {
    name,
    handler: handler as EventHandler<DomainEventName>,
  };
  const existing = subscribers.get(eventName);
  if (existing) existing.push(entry);
  else subscribers.set(eventName, [entry]);
}

/** Removes every subscriber. Used by tests; never call it from app code. */
export function resetSubscribers(): void {
  subscribers.clear();
}

export function subscriberCount(eventName: DomainEventName): number {
  return subscribers.get(eventName)?.length ?? 0;
}

export interface EmitOptions<N extends DomainEventName> {
  name: N;
  projectId: string;
  payload: DomainEventPayloads[N];
  actorType: "customer" | "staff" | "system";
  actorId?: string | null;
  occurredAt?: Date;
}

/**
 * Records an event and notifies subscribers.
 *
 * Refuses to emit a privileged event with a customer actor. That is a cheap
 * check against a whole class of mistake: a future code path that lets a
 * customer-triggered request emit `build.started` would be starting its own
 * guarantee, and the refusal makes that a loud failure rather than a silent
 * commercial one.
 */
export async function emit<N extends DomainEventName>(
  options: EmitOptions<N>,
): Promise<DomainEvent<N>> {
  const {
    name,
    projectId,
    payload,
    actorType,
    actorId = null,
    occurredAt = new Date(),
  } = options;

  if (actorType === "customer" && PRIVILEGED_EVENTS.includes(name)) {
    throw new Error(
      `"${name}" cannot be emitted with a customer actor. It is a system or staff fact.`,
    );
  }

  const event: DomainEvent<N> = {
    name,
    projectId,
    payload,
    actorType,
    actorId,
    occurredAt,
    version: EVENT_PAYLOAD_VERSION,
  };

  // Persisted first. A handler failure must not lose the fact.
  await db.insert(projectEvents).values({
    projectId,
    type: name,
    actorType,
    actorId,
    payload: { ...payload, v: EVENT_PAYLOAD_VERSION } as Record<string, unknown>,
    occurredAt,
  });

  const handlers = subscribers.get(name) ?? [];
  for (const entry of handlers) {
    try {
      await entry.handler(event);
    } catch (error) {
      // Isolated on purpose: a broken subscriber is a bug in that subscriber,
      // not a reason to fail the build step that triggered it.
      logger.error("event handler failed", {
        event: name,
        handler: entry.name,
        projectId,
        error,
      });
    }
  }

  return event;
}
