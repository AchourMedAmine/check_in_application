import { NextRequest } from "next/server";
import { handleApiRequest } from "@/lib/api-handler";
import { requireScanner } from "@/lib/scanners";
import { markStarted, undoStart } from "@/lib/attendance/session";

// POST /api/sessions/[id]/start — the session really began (the moderator or
// instructor started). Any scanner: the person at the door is the one who
// sees it. Lateness is measured from this moment.
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/sessions/[id]/start">
) {
  return handleApiRequest(async () => {
    await requireScanner(req);
    const { id } = await ctx.params;
    return markStarted(id);
  }, req);
}

// DELETE /api/sessions/[id]/start — undo a start tapped by mistake, removing
// the Late penalties it caused. Managers only.
export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<"/api/sessions/[id]/start">
) {
  return handleApiRequest(async () => {
    await requireScanner(req, { role: "Manager" });
    const { id } = await ctx.params;
    return undoStart(id);
  }, req);
}
