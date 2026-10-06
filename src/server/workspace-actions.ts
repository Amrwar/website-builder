"use server";

import { revalidatePath } from "next/cache";

import { ApiError } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import { requireUser } from "@/server/auth";
import {
  decideApproval,
  decideChangeRequest,
  requestChange,
  sendMessage,
} from "@/server/workspace/collaboration";
import { recordUpload } from "@/server/workspace/files";
import { submitAssets } from "@/server/workspace/lifecycle";
import { markWorkspaceRead } from "@/server/workspace/queries";

/**
 * Build Room actions.
 *
 * Thin wrappers. Every one re-establishes the caller from the session and
 * hands off to a module that checks participation itself -- the authorization
 * lives next to the data, not here, so an action added later cannot forget it
 * by omission.
 *
 * All of them return a result object rather than throwing, because these are
 * called from forms where a thrown error means a blank screen.
 */

export type ActionOutcome<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { value: T }))
  | { ok: false; reason: string; message: string };

function failure(error: unknown, fallback: string): ActionOutcome<never> {
  if (error instanceof ApiError) {
    return { ok: false, reason: error.code, message: error.message };
  }
  logger.error("workspace action failed", { error });
  return { ok: false, reason: "internal_error", message: fallback };
}

/** Revalidates the room so the next render shows the change. */
function refresh(reference: string): void {
  revalidatePath(`/projects/${reference}`);
}

export async function postMessage(
  projectId: string,
  reference: string,
  body: string,
): Promise<ActionOutcome> {
  try {
    const context = await requireUser();
    await sendMessage(String(projectId), String(body ?? ""), context);
    refresh(String(reference));
    return { ok: true };
  } catch (error) {
    return failure(error, "Your message could not be sent.");
  }
}

export async function confirmAssets(
  projectId: string,
  reference: string,
): Promise<ActionOutcome<{ reason?: string }>> {
  try {
    const context = await requireUser();
    const result = await submitAssets(String(projectId), context);

    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason,
        message:
          result.reason === "no_assets"
            ? "Add at least one file before confirming."
            : "This project is not waiting for assets.",
      };
    }

    refresh(String(reference));
    return { ok: true, value: {} };
  } catch (error) {
    return failure(error, "We could not confirm your assets.");
  }
}

export async function submitChangeRequest(
  projectId: string,
  reference: string,
  title: string,
  description: string,
): Promise<ActionOutcome> {
  try {
    const context = await requireUser();
    await requestChange(
      String(projectId),
      { title: String(title ?? ""), description: String(description ?? "") },
      context,
    );
    refresh(String(reference));
    return { ok: true };
  } catch (error) {
    return failure(error, "Your change request could not be sent.");
  }
}

export async function respondToChangeRequest(
  changeRequestId: string,
  reference: string,
  decision: "approved" | "rejected" | "withdrawn",
): Promise<ActionOutcome> {
  try {
    const context = await requireUser();
    await decideChangeRequest(String(changeRequestId), decision, context);
    refresh(String(reference));
    return { ok: true };
  } catch (error) {
    return failure(error, "We could not record your decision.");
  }
}

export async function respondToApproval(
  approvalId: string,
  reference: string,
  decision: "approved" | "changes_requested",
  note?: string,
): Promise<ActionOutcome> {
  try {
    const context = await requireUser();
    await decideApproval(String(approvalId), decision, context, note);
    refresh(String(reference));
    return { ok: true };
  } catch (error) {
    return failure(error, "We could not record your decision.");
  }
}

export async function markRead(
  projectId: string,
  reference: string,
): Promise<ActionOutcome> {
  try {
    const context = await requireUser();
    await markWorkspaceRead(String(projectId), context.user.id);
    refresh(String(reference));
    return { ok: true };
  } catch (error) {
    return failure(error, "Could not update your read state.");
  }
}

/**
 * Records a file the browser has just written to blob storage.
 *
 * The client calls this once `upload()` resolves. Everything it passes is
 * re-verified server-side against the blob store, so a crafted call cannot
 * attach someone else's file to a project. See `server/workspace/files.ts`.
 */
export async function recordUploadedFile(
  projectId: string,
  reference: string,
  pathname: string,
  name: string,
  contentType: string,
): Promise<ActionOutcome> {
  try {
    const context = await requireUser();
    await recordUpload(
      String(projectId),
      {
        pathname: String(pathname ?? ""),
        name: String(name ?? ""),
        contentType: String(contentType ?? ""),
      },
      context,
    );
    refresh(String(reference));
    return { ok: true };
  } catch (error) {
    return failure(error, "That file could not be saved.");
  }
}
