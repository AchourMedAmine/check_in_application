import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiRequest } from "@/lib/api-handler";
import { ValidationError } from "@/lib/errors";
import { getSessionOrThrow } from "@/lib/attendance/session";
import { getSessionStats } from "@/lib/attendance/scan";
import { closeSession } from "@/lib/attendance/close-session";
import type { SessionStatus } from "@/generated/prisma/client";

const ALLOWED: SessionStatus[] = ["Scheduled", "Open", "Closed"];

// PATCH /api/sessions/[id] — open or close a session.
// Body: { status: "Open" | "Closed" | "Scheduled" }
export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<"/api/sessions/[id]">
) {
  return handleApiRequest(async () => {
    const { id } = await ctx.params;
    const body = (await req.json()) as { status?: SessionStatus };

    if (!body.status || !ALLOWED.includes(body.status)) {
      throw new ValidationError(
        `status must be one of ${ALLOWED.join(", ")}`
      );
    }

    const existing = await getSessionOrThrow(id);

    // Closing is not just a status flip: breaks still running when the session
    // ended have to be settled, or leaving early would cost nothing.
    if (body.status === "Closed") {
      const settled = await closeSession(existing);
      const session = await getSessionOrThrow(id);
      return {
        ...session,
        stats: await getSessionStats(session),
        settled,
      };
    }

    const session = await prisma.session.update({
      where: { id },
      data: { status: body.status },
    });

    return { ...session, stats: await getSessionStats(session) };
  }, req);
}
