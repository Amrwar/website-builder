import { createHandler } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/response";
import { permissionsFor } from "@/config/roles";
import { requireUser } from "@/server/auth";

/**
 * The signed-in user.
 *
 * Exists partly to be useful and partly to be the worked example of how an
 * authenticated endpoint is written here: `requireUser` throws an `ApiError`,
 * the handler wrapper turns it into a 401 with the standard envelope, and no
 * identifying value is ever read from the request.
 *
 * Note what is returned. Role and permissions are included because the client
 * uses them to decide what to render -- never to decide what is allowed. Every
 * privileged operation re-derives permissions server-side.
 */
export const dynamic = "force-dynamic";

export const GET = createHandler(async () => {
  const { user } = await requireUser();

  return apiSuccess({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    permissions: permissionsFor(user.role),
    preferences: {
      locale: user.preferredLocale,
      currency: user.preferredCurrency,
      timezone: user.timezone,
    },
  });
});
