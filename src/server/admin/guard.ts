import "server-only";

import { notFound } from "next/navigation";

import { adminSection, canSeeSection, type AdminSectionId } from "@/config/admin-nav";
import { ApiError } from "@/lib/api/response";
import { logger } from "@/lib/logger";
import { getAuthContext, type AuthContext } from "@/server/auth";

/**
 * The guard every console page calls first.
 *
 * Reads the section's requirements from the same declaration the navigation
 * reads, so a page cannot be stricter or looser than the sidebar implies.
 * Adding a section means adding one entry in `config/admin-nav`; forgetting to
 * guard it is not possible, because the guard is what resolves the section.
 *
 * Refuses with `notFound()` rather than a redirect or a 403. A staff member
 * without `finance:read` should get the same page as someone asking for a
 * route that does not exist -- a "forbidden" tells them the section is real
 * and that they are close to something interesting.
 */
export async function requireAdminSection(
  sectionId: AdminSectionId,
): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) notFound();

  const section = adminSection(sectionId);
  if (!section) {
    // A page naming a section that is not declared is a programming error, and
    // failing closed is the only safe reading of it.
    logger.error("admin page references an undeclared section", { sectionId });
    notFound();
  }

  if (!canSeeSection(context.user.role, section)) {
    logger.warn("admin section refused", {
      sectionId,
      userId: context.user.id,
      role: context.user.role,
    });
    notFound();
  }

  return context;
}

/**
 * The same check, for a route handler or action where `notFound()` is wrong.
 */
export async function assertAdminSection(
  sectionId: AdminSectionId,
  context: AuthContext,
): Promise<void> {
  const section = adminSection(sectionId);
  if (!section || !canSeeSection(context.user.role, section)) {
    throw new ApiError("not_found", "Not found.");
  }
}
