import { NextResponse } from "next/server";

import { createHandler } from "@/lib/api/handler";
import { requireUser } from "@/server/auth";
import { resolveDownload } from "@/server/workspace/files";

/**
 * Downloads a project file.
 *
 * The blob URL is resolved at the moment of asking, after an authorization
 * check, and the caller is redirected to it. The stored pathname never appears
 * in a page, so a leaked row is not a leaked file.
 *
 * Anyone who may not read the file gets `not_found` -- the same answer as for a
 * file that does not exist, so the endpoint cannot be used to discover which
 * ids are real.
 */

export const dynamic = "force-dynamic";

export const GET = createHandler(async (_request, { params }) => {
  const context = await requireUser();
  const { reference, fileId } = (await params) as { reference: string; fileId: string };

  const { url } = await resolveDownload(reference, fileId, context);

  const response = NextResponse.redirect(url, 307);
  // Never cached by a shared cache: the URL is resolved per authorized request
  // and must not be served to the next person through a CDN.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
});
