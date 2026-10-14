import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiRequest } from "@/lib/api-handler";
import { ScanQRInput } from "@/lib/types";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { getActiveSession, getSessionOrThrow } from "@/lib/attendance/session";
import { recordScan, getSessionStats } from "@/lib/attendance/scan";
import { requireAssigned, requireScanner } from "@/lib/scanners";

// name / lastName / email live on `users`, joined via participants.user_id
const withUser = {
  user: { select: { id: true, email: true, name: true, lastName: true } },
} as const;

// POST /api/scan — toggle a participant's presence in the active session.
// Body: { qrCode: "<participant id>", sessionId?, stationId? }
export async function POST(req: NextRequest) {
  return handleApiRequest(async () => {
    const scanner = await requireScanner(req);
    const body = (await req.json()) as ScanQRInput;
    const id = body.qrCode?.trim();

    if (!id) {
      throw new ValidationError("QR code is required");
    }

    const session = body.sessionId
      ? await getSessionOrThrow(body.sessionId)
      : await getActiveSession();

    await requireAssigned(scanner, session.id);

    if (session.status !== "Open") {
      throw new ValidationError(`Session "${session.title}" is not open`);
    }

    const participant = await prisma.participant.findUnique({
      where: { id },
      include: withUser,
    });

    if (!participant) {
      throw new NotFoundError("Participant");
    }

    const outcome = await recordScan({
      participant,
      session,
      scannerId: scanner.id,
      stationId: body.stationId,
    });

    // The scan is committed at this point. Failing the request now would
    // tell staff it didn't go through, and a re-scan would flip the
    // participant straight back — so the figures are best-effort.
    const stats = await getSessionStats(session).catch((err) => {
      console.error("Scan recorded, but stats failed:", err);
      return null;
    });

    return {
      participant,
      session: {
        id: session.id,
        title: session.title,
        breakAllowanceMinutes: session.breakAllowanceMinutes,
        audience: session.audience,
        mandatory: session.mandatory,
      },
      ...outcome,
      stats,
    };
  }, req);
}

// GET /api/scan — all registered participants (handy for testing without
// badges). Managers only: officers have no reason to download the list.
export async function GET(req: NextRequest) {
  return handleApiRequest(async () => {
    await requireScanner(req, { role: "Manager" });
    return prisma.participant.findMany({
      include: withUser,
      orderBy: { user: { lastName: "asc" } },
    });
  }, req);
}
