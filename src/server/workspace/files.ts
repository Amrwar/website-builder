import "server-only";

import { head } from "@vercel/blob";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { projectFiles, type ProjectFile } from "@/db/schema";
import type { FileKind } from "@/db/schema/enums";
import { ApiError } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import { emit } from "@/server/events/bus";
import type { AuthContext } from "@/server/auth";
import { assertParticipant } from "./collaboration";

/**
 * Project files.
 *
 * Uploads go straight from the browser to blob storage, because a function
 * request body is capped at 4.5 MB and a brand pack is routinely larger. That
 * means the browser briefly holds a write token, so three things are enforced
 * here rather than trusted:
 *
 *  1. The token is only ever issued after participation is checked, and only
 *     for a pathname under this project's own prefix.
 *  2. After the upload, the row is written **server-side**, and the blob is
 *     verified to exist at the pathname the client claims.
 *  3. The claimed pathname is re-checked against the project prefix, so a
 *     client cannot register someone else's blob against its own project.
 */

/** Blob keys are namespaced per project, which is what makes (3) checkable. */
export function projectPrefix(projectId: string): string {
  return `projects/${projectId}/`;
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const ALLOWED_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "application/zip",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

export function isAllowedContentType(contentType: string): boolean {
  return ALLOWED_CONTENT_TYPES.includes(contentType);
}

export const ALLOWED_UPLOAD_TYPES: readonly string[] = ALLOWED_CONTENT_TYPES;

/**
 * Records a completed upload.
 *
 * Called after the browser has finished writing to blob storage. Everything
 * the client asserts is checked: that it may touch this project, that the
 * pathname sits under the project's prefix, and that a blob actually exists
 * there with the size and type claimed.
 */
export async function recordUpload(
  projectId: string,
  input: { pathname: string; name: string; contentType: string; kind?: FileKind },
  context: AuthContext,
): Promise<ProjectFile> {
  const { isStaff } = await assertParticipant(projectId, context);

  const prefix = projectPrefix(projectId);
  if (!input.pathname.startsWith(prefix)) {
    // The client is claiming a blob outside this project's namespace.
    logger.warn("upload rejected: pathname outside the project prefix", {
      projectId,
      pathname: input.pathname,
    });
    throw new ApiError("bad_request", "That file does not belong to this project.");
  }

  // The blob store is the authority on what was actually written.
  let blob;
  try {
    blob = await head(input.pathname);
  } catch {
    throw new ApiError("bad_request", "That upload could not be verified.");
  }

  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new ApiError("bad_request", "That file is too large.");
  }
  if (!isAllowedContentType(blob.contentType)) {
    throw new ApiError("bad_request", "That file type is not accepted.");
  }

  // Versioning is by group, so re-sending a logo produces v2 rather than
  // overwriting the file the build was done against.
  const groupKey = input.name.toLowerCase().trim();
  const [latest] = await db
    .select({ version: projectFiles.version })
    .from(projectFiles)
    .where(
      and(eq(projectFiles.projectId, projectId), eq(projectFiles.groupKey, groupKey)),
    )
    .orderBy(desc(projectFiles.version))
    .limit(1);

  const [created] = await db
    .insert(projectFiles)
    .values({
      projectId,
      kind: input.kind ?? (isStaff ? "design_asset" : "customer_upload"),
      // Staff uploads default to internal; a customer's own file is theirs to
      // see. Defaulting everything to customer-visible would make an internal
      // working file one forgotten flag from being published.
      visibility: isStaff ? "internal" : "customer",
      uploadedByUserId: context.user.id,
      name: input.name.slice(0, 255),
      groupKey,
      version: (latest?.version ?? 0) + 1,
      pathname: blob.pathname,
      contentType: blob.contentType,
      sizeBytes: blob.size,
    })
    .returning();

  if (!created) throw new Error("File insert returned no row.");

  // Through the bus, not straight to the table. It is a catalogued event, and
  // written directly no subscriber could ever see it -- which is the whole
  // point of having catalogued it.
  await emit({
    name: "file.uploaded",
    projectId,
    actorType: isStaff ? "staff" : "customer",
    actorId: context.user.clerkUserId,
    payload: { fileId: created.id, name: created.name, version: created.version },
  });

  logger.info("file recorded", { projectId, fileId: created.id });
  return created;
}

/**
 * Resolves a file the caller may download, and returns its blob URL.
 *
 * The stored `pathname` is never rendered into a page. A download is an
 * authorized request that resolves the URL at the moment of asking, so a
 * leaked row -- or a screenshot of one -- is not a leaked file.
 */
export async function resolveDownload(
  reference: string,
  fileId: string,
  context: AuthContext,
): Promise<{ url: string; name: string }> {
  const isStaff = context.can("project:read:all");

  const file = await db.query.projectFiles.findFirst({
    where: eq(projectFiles.id, fileId),
    with: { project: true },
  });

  if (!file || file.deletedAt) throw new ApiError("not_found", "Not found.");
  if (file.project.reference !== reference) throw new ApiError("not_found", "Not found.");

  // Ownership and visibility are both checked. An internal file is invisible
  // to the customer even though it hangs off their own project.
  const mayRead =
    isStaff ||
    (file.project.ownerId === context.user.id && file.visibility === "customer");

  if (!mayRead) throw new ApiError("not_found", "Not found.");

  const blob = await head(file.pathname);
  return { url: blob.url, name: file.name };
}
