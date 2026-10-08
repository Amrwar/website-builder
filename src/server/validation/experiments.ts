import "server-only";

import { randomBytes } from "node:crypto";

import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { serverEnv } from "@/config/env";
import {
  RESULTS_DAYS,
  VALIDATION_LIMITS,
  type CaptureMode,
  type ValidationEventKind,
  type ValidationStatus,
} from "@/config/validation";
import { db } from "@/db/client";
import {
  users,
  validationEvents,
  validationExperiments,
  validationLeads,
  type ValidationExperimentRow,
} from "@/db/schema";
import { ApiError } from "@/lib/api/response";
import { fingerprint, ipFingerprint } from "@/lib/growth/codes";
import { logger } from "@/lib/logger";
import { fromMajorUnits, type Currency } from "@/lib/pricing/money";
import {
  computeSignals,
  validationContentSchema,
  type ValidationContent,
  type ValidationCounts,
  type ValidationSignals,
} from "@/lib/validation/content";
import type { AuthContext } from "@/server/auth";
import { recordAudit } from "@/server/admin/audit";

/**
 * Business-idea validation pages.
 *
 * Two audiences, two rules. The owner -- a signed-in customer -- reads and
 * changes only their own tests, scoped by the session's user id and never
 * by an id in the payload. Everyone else reaches a test only through its
 * public slug, can record that they looked and leave their details, and can
 * never read anything back: not the counts, and above all not other
 * people's leads.
 */

/* -------------------------------------------------------------------------
 * Content as stored
 * ---------------------------------------------------------------------- */

export interface StoredContent extends Omit<ValidationContent, "price"> {
  price: {
    model: ValidationContent["price"]["model"];
    amountMinorUnits: number | null;
    currency: Currency;
  };
}

function toStored(content: ValidationContent): StoredContent {
  const currency = content.price.currency as Currency;
  return {
    ...content,
    price: {
      model: content.price.model,
      amountMinorUnits:
        content.price.model === "none" || content.price.amount === null
          ? null
          : fromMajorUnits(content.price.amount, currency).minorUnits,
      currency,
    },
  };
}

/** Stored content, or null when it no longer reads -- hidden, not guessed at. */
export function readStored(
  row: Pick<ValidationExperimentRow, "content" | "id">,
): StoredContent | null {
  const raw = row.content as Partial<StoredContent> | null;
  if (!raw || raw.version !== 1 || !raw.price) {
    logger.error("validation content unreadable", { experimentId: row.id });
    return null;
  }
  return raw as StoredContent;
}

/* -------------------------------------------------------------------------
 * Publishing
 * ---------------------------------------------------------------------- */

function slugStem(name: string): string {
  const stem = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
  // A name in Arabic script has no ASCII stem; the suffix alone still works.
  return stem || "idea";
}

function newSlug(name: string): string {
  // 8 characters of base-36 from 6 random bytes: unguessable enough that a
  // test is only found by someone it was shared with.
  const suffix = BigInt(`0x${randomBytes(6).toString("hex")}`)
    .toString(36)
    .padStart(8, "0")
    .slice(-8);
  return `${slugStem(name)}-${suffix}`;
}

async function liveCount(ownerUserId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(validationExperiments)
    .where(
      and(
        eq(validationExperiments.ownerUserId, ownerUserId),
        eq(validationExperiments.status, "live"),
      ),
    );
  return row?.value ?? 0;
}

export type PublishResult =
  { ok: true; id: string; slug: string } | { ok: false; reason: "invalid" | "limit" };

export async function publishExperiment(
  rawContent: unknown,
  context: AuthContext,
): Promise<PublishResult> {
  const parsed = validationContentSchema.safeParse(rawContent);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  if ((await liveCount(context.user.id)) >= VALIDATION_LIMITS.maxLive) {
    return { ok: false, reason: "limit" };
  }

  const content = toStored(parsed.data);
  // A slug collision is astronomically unlikely; one retry makes it
  // impossible to notice rather than merely improbable.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const [row] = await db
        .insert(validationExperiments)
        .values({
          ownerUserId: context.user.id,
          slug: newSlug(content.businessName),
          locale: content.locale,
          captureMode: content.captureMode,
          content: content as unknown as Record<string, unknown>,
        })
        .returning({ id: validationExperiments.id, slug: validationExperiments.slug });
      if (row) return { ok: true, id: row.id, slug: row.slug };
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
  throw new Error("validation experiment was not created");
}

/* -------------------------------------------------------------------------
 * The owner's view
 * ---------------------------------------------------------------------- */

const idSchema = z.string().uuid();

async function ownedRow(rawId: string, context: AuthContext) {
  const id = idSchema.safeParse(rawId);
  if (!id.success) return null;
  const [row] = await db
    .select()
    .from(validationExperiments)
    .where(
      and(
        eq(validationExperiments.id, id.data),
        // The session's user, never an id from the request.
        eq(validationExperiments.ownerUserId, context.user.id),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function countsFor(
  experimentIds: readonly string[],
): Promise<Map<string, ValidationCounts>> {
  const empty = (): ValidationCounts => ({
    visitors: 0,
    views: 0,
    ctaClicks: 0,
    inquiries: 0,
    signups: 0,
  });
  const result = new Map(experimentIds.map((id) => [id, empty()]));
  if (experimentIds.length === 0) return result;

  const rows = await db
    .select({
      experimentId: validationEvents.experimentId,
      kind: validationEvents.kind,
      events: count(),
      // Distinct visitors; an unhashed event counts as its own visitor.
      distinct: sql<number>`count(distinct coalesce(${validationEvents.visitorHash}, ${validationEvents.id}::text))::int`,
    })
    .from(validationEvents)
    .where(inArray(validationEvents.experimentId, [...experimentIds]))
    .groupBy(validationEvents.experimentId, validationEvents.kind);

  for (const row of rows) {
    const entry = result.get(row.experimentId);
    if (!entry) continue;
    if (row.kind === "view") {
      entry.views = row.events;
      entry.visitors = row.distinct;
    }
    // One visitor clicking three times is one click-through.
    if (row.kind === "cta_click") entry.ctaClicks = row.distinct;
    if (row.kind === "inquiry") entry.inquiries = row.events;
    if (row.kind === "signup") entry.signups = row.events;
  }
  return result;
}

export interface ExperimentSummary {
  id: string;
  slug: string;
  status: ValidationStatus;
  locale: string;
  captureMode: CaptureMode;
  content: StoredContent;
  createdAt: Date;
  closedAt: Date | null;
  signals: ValidationSignals;
}

function summarise(row: ValidationExperimentRow, counts: ValidationCounts | undefined) {
  const content = readStored(row);
  if (!content) return null;
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    locale: row.locale,
    captureMode: row.captureMode,
    content,
    createdAt: row.createdAt,
    closedAt: row.closedAt,
    signals: computeSignals(
      counts ?? { visitors: 0, views: 0, ctaClicks: 0, inquiries: 0, signups: 0 },
    ),
  } satisfies ExperimentSummary;
}

export async function listExperiments(
  context: AuthContext,
): Promise<ExperimentSummary[]> {
  const rows = await db
    .select()
    .from(validationExperiments)
    .where(eq(validationExperiments.ownerUserId, context.user.id))
    .orderBy(desc(validationExperiments.createdAt));
  const counts = await countsFor(rows.map((row) => row.id));
  return rows
    .map((row) => summarise(row, counts.get(row.id)))
    .filter((entry): entry is ExperimentSummary => entry !== null);
}

export interface DailyPoint {
  /** UTC day, YYYY-MM-DD. */
  day: string;
  views: number;
  leads: number;
}

export interface ExperimentResults extends ExperimentSummary {
  daily: DailyPoint[];
  leads: {
    id: string;
    kind: CaptureMode;
    name: string | null;
    email: string;
    message: string | null;
    createdAt: Date;
  }[];
  /** False when no salt is configured and visitors are really page views. */
  distinctVisitors: boolean;
}

export async function experimentResults(
  rawId: string,
  context: AuthContext,
  now: Date = new Date(),
): Promise<ExperimentResults | null> {
  const row = await ownedRow(rawId, context);
  if (!row) return null;
  const summary = summarise(row, (await countsFor([row.id])).get(row.id));
  if (!summary) return null;

  const since = new Date(now);
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (RESULTS_DAYS - 1));

  const [dailyRows, leads] = await Promise.all([
    db
      .select({
        day: sql<string>`to_char(${validationEvents.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`,
        kind: validationEvents.kind,
        events: count(),
      })
      .from(validationEvents)
      .where(
        and(
          eq(validationEvents.experimentId, row.id),
          gte(validationEvents.createdAt, since),
        ),
      )
      .groupBy(
        sql`to_char(${validationEvents.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`,
        validationEvents.kind,
      ),
    db
      .select({
        id: validationLeads.id,
        kind: validationLeads.kind,
        name: validationLeads.name,
        email: validationLeads.email,
        message: validationLeads.message,
        createdAt: validationLeads.createdAt,
      })
      .from(validationLeads)
      .where(eq(validationLeads.experimentId, row.id))
      .orderBy(desc(validationLeads.createdAt))
      .limit(500),
  ]);

  // Every day in the window, including the empty ones: a gap is a fact.
  const daily: DailyPoint[] = [];
  for (let offset = 0; offset < RESULTS_DAYS; offset += 1) {
    const date = new Date(since);
    date.setUTCDate(since.getUTCDate() + offset);
    daily.push({ day: date.toISOString().slice(0, 10), views: 0, leads: 0 });
  }
  const byDay = new Map(daily.map((point) => [point.day, point]));
  for (const entry of dailyRows) {
    const point = byDay.get(entry.day);
    if (!point) continue;
    if (entry.kind === "view") point.views += entry.events;
    if (entry.kind === "inquiry" || entry.kind === "signup") point.leads += entry.events;
  }

  return {
    ...summary,
    daily,
    leads,
    distinctVisitors: Boolean(serverEnv().GROWTH_FINGERPRINT_SECRET),
  };
}

export type StatusResult =
  { ok: true } | { ok: false; reason: "not_found" | "closed" | "limit" };

/**
 * Pauses, resumes or closes the owner's own test. Closing is final: a
 * closed test's numbers are a finished result, and reopening it would mix
 * two runs into one set of figures.
 */
export async function setExperimentStatus(
  rawId: string,
  rawStatus: unknown,
  context: AuthContext,
): Promise<StatusResult> {
  const status = z.enum(["live", "paused", "closed"]).safeParse(rawStatus);
  const row = await ownedRow(rawId, context);
  if (!row || !status.success) return { ok: false, reason: "not_found" };
  if (row.status === "closed") return { ok: false, reason: "closed" };
  if (row.status === status.data) return { ok: true };
  if (
    status.data === "live" &&
    (await liveCount(context.user.id)) >= VALIDATION_LIMITS.maxLive
  ) {
    return { ok: false, reason: "limit" };
  }

  await db
    .update(validationExperiments)
    .set({
      status: status.data,
      updatedAt: new Date(),
      closedAt: status.data === "closed" ? new Date() : null,
    })
    .where(
      and(
        eq(validationExperiments.id, row.id),
        eq(validationExperiments.ownerUserId, context.user.id),
      ),
    );
  return { ok: true };
}

/** The test's content, for carrying into Business-in-a-Box. */
export async function experimentContentForOwner(rawId: string, context: AuthContext) {
  const row = await ownedRow(rawId, context);
  return row ? readStored(row) : null;
}

/* -------------------------------------------------------------------------
 * The public page
 * ---------------------------------------------------------------------- */

const slugSchema = z.string().regex(/^[a-z0-9-]{3,48}$/);

export interface PublicExperiment {
  id: string;
  ownerUserId: string;
  slug: string;
  status: ValidationStatus;
  captureMode: CaptureMode;
  content: StoredContent;
}

export async function publicExperiment(
  rawSlug: string,
): Promise<PublicExperiment | null> {
  const slug = slugSchema.safeParse(rawSlug);
  if (!slug.success) return null;
  const [row] = await db
    .select()
    .from(validationExperiments)
    .where(eq(validationExperiments.slug, slug.data))
    .limit(1);
  if (!row) return null;
  const content = readStored(row);
  if (!content) return null;
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    slug: row.slug,
    status: row.status,
    captureMode: row.captureMode,
    content,
  };
}

export interface VisitorMeta {
  ip: string | null;
  userAgent: string;
  /** The signed-in viewer, if any: the owner's own visits are not signals. */
  viewerUserId: string | null;
  now?: Date;
}

/**
 * Crawlers and link-preview fetchers, which would otherwise be most of the
 * "visitors" of a page shared in a chat. A list, not a model: it misses
 * some, and the results' small-sample warning is the honest backstop.
 */
const NOT_A_PERSON =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|lighthouse|monitor/i;

export function visitorHash(experimentId: string, meta: VisitorMeta): string | null {
  const secret = serverEnv().GROWTH_FINGERPRINT_SECRET;
  if (!secret) return null;
  const day = (meta.now ?? new Date()).toISOString().slice(0, 10);
  const network = ipFingerprint(meta.ip, secret) ?? "unknown";
  // Scoped to the test and the day: distinct visitors can be counted, but
  // the same person cannot be followed from one test, or one day, to the next.
  return fingerprint(`${experimentId}:${day}:${network}:${meta.userAgent}`, secret);
}

/** Records a view or a call-to-action click. Silent about why it did not. */
export async function recordVisit(
  rawSlug: string,
  kind: Extract<ValidationEventKind, "view" | "cta_click">,
  meta: VisitorMeta,
): Promise<boolean> {
  if (NOT_A_PERSON.test(meta.userAgent)) return false;
  const experiment = await publicExperiment(rawSlug);
  if (!experiment || experiment.status !== "live") return false;
  if (meta.viewerUserId && meta.viewerUserId === experiment.ownerUserId) return false;

  await db.insert(validationEvents).values({
    experimentId: experiment.id,
    kind,
    visitorHash: visitorHash(experiment.id, meta),
  });
  return true;
}

export const leadInputSchema = z.object({
  name: z.string().trim().max(VALIDATION_LIMITS.leadName).optional().default(""),
  email: z.string().trim().toLowerCase().email().max(254),
  message: z.string().trim().max(VALIDATION_LIMITS.leadMessage).optional().default(""),
  consent: z.literal(true),
  /** A field no person can see. Anything in it is a script filling forms. */
  company: z.string().max(0).optional().default(""),
});

export type LeadResult = { ok: true } | { ok: false; reason: "invalid" | "closed" };

export async function submitLead(
  rawSlug: string,
  input: unknown,
  meta: VisitorMeta,
): Promise<LeadResult> {
  const experiment = await publicExperiment(rawSlug);
  if (!experiment) return { ok: false, reason: "closed" };
  if (experiment.status !== "live") return { ok: false, reason: "closed" };

  // A filled honeypot is answered as a success, so the script learns
  // nothing, and stored as nothing, so the owner's figures stay clean.
  const honeypot = (input as { company?: unknown } | null)?.company;
  if (typeof honeypot === "string" && honeypot.length > 0) return { ok: true };

  const parsed = leadInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  const kind = experiment.captureMode;
  const now = meta.now ?? new Date();
  await db.transaction(async (tx) => {
    await tx.insert(validationLeads).values({
      experimentId: experiment.id,
      kind,
      name: parsed.data.name || null,
      email: parsed.data.email,
      // A waitlist asks for an email and nothing else; a message sent to one
      // anyway is not kept.
      message: kind === "inquiry" ? parsed.data.message || null : null,
      consentedAt: now,
    });
    await tx.insert(validationEvents).values({
      experimentId: experiment.id,
      kind: kind === "inquiry" ? "inquiry" : "signup",
      visitorHash: visitorHash(experiment.id, meta),
    });
  });
  return { ok: true };
}

/* -------------------------------------------------------------------------
 * Moderation
 * ---------------------------------------------------------------------- */

/**
 * Every test, for staff, without its leads.
 *
 * Public pages on our domain written by customers need a way to be taken
 * down. Staff see what was published and by whom; they never see who
 * responded, which is the customer's data.
 */
export async function listExperimentsForStaff(context: AuthContext) {
  if (!context.can("project:manage")) throw new ApiError("not_found", "Not found.");
  const rows = await db
    .select({ experiment: validationExperiments, ownerEmail: users.email })
    .from(validationExperiments)
    .innerJoin(users, eq(users.id, validationExperiments.ownerUserId))
    .orderBy(desc(validationExperiments.createdAt))
    .limit(200);
  const counts = await countsFor(rows.map((row) => row.experiment.id));
  return rows
    .map((row) => {
      const summary = summarise(row.experiment, counts.get(row.experiment.id));
      return summary ? { ...summary, ownerEmail: row.ownerEmail } : null;
    })
    .filter((entry) => entry !== null);
}

export async function closeExperimentAsStaff(
  rawId: string,
  reason: string,
  context: AuthContext,
): Promise<void> {
  if (!context.can("project:manage")) throw new ApiError("not_found", "Not found.");
  const id = idSchema.safeParse(rawId);
  if (!id.success) throw new ApiError("not_found", "Not found.");
  const [row] = await db
    .update(validationExperiments)
    .set({ status: "closed", closedAt: new Date(), updatedAt: new Date() })
    .where(eq(validationExperiments.id, id.data))
    .returning({
      slug: validationExperiments.slug,
      status: validationExperiments.status,
    });
  if (!row) throw new ApiError("not_found", "Not found.");

  await recordAudit({
    category: "configuration",
    action: "validation.closed_by_staff",
    actor: context,
    subjectType: "validation_experiment",
    subjectId: id.data,
    subjectLabel: row.slug,
    after: { status: "closed" },
    reason: reason.trim().slice(0, 500) || null,
  });
}
