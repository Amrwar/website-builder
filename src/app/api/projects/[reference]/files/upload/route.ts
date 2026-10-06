import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { projects } from "@/db/schema";
import { createHandler } from "@/lib/api/handler";
import { ApiError, apiSuccess } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import { requireUser } from "@/server/auth";
import { assertParticipant } from "@/server/workspace/collaboration";
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_UPLOAD_BYTES,
  projectPrefix,
} from "@/server/workspace/files";

/**
 * Issues a one-shot upload token.
 *
 * The browser uploads straight to blob storage because a function body is
 * capped at 4.5 MB. That makes this endpoint the security boundary: the token
 * it hands out is scoped to a single pathname under one project's prefix, with
 * the accepted content types and maximum size pinned server-side.
 *
 * A caller who is not a participant never gets a token at all.
 */

export const dynamic = "force-dynamic";

export const POST = createHandler(async (request, { params }) => {
  const context = await requireUser();
  const { reference } = (await params) as { reference: string };

  const project = await db.query.projects.findFirst({
    where: eq(projects.reference, reference),
  });
  if (!project) throw new ApiError("not_found", "Not found.");

  // Throws not_found for anyone who may not touch this project.
  await assertParticipant(project.id, context);

  const body = (await request.json()) as HandleUploadBody;

  const result = await handleUpload({
    body,
    request,
    onBeforeGenerateToken: async (pathname) => {
      // The pathname the client asked for has to live under this project.
      if (!pathname.startsWith(projectPrefix(project.id))) {
        throw new ApiError("bad_request", "Invalid upload path.");
      }

      return {
        allowedContentTypes: [...ALLOWED_UPLOAD_TYPES],
        maximumSizeInBytes: MAX_UPLOAD_BYTES,
        // A random suffix stops one upload silently replacing another, which
        // is what makes file versioning possible at all.
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ projectId: project.id, userId: context.user.id }),
      };
    },
    onUploadCompleted: async ({ blob }) => {
      // Fires only when the app is publicly reachable, so it is treated as a
      // log line rather than as the moment the row is written. The client
      // calls `recordUploadedFile` once `upload()` resolves, and that path
      // verifies the blob independently -- see server/workspace/files.ts.
      logger.info("blob upload completed", { pathname: blob.pathname });
    },
  });

  return apiSuccess(result);
});
