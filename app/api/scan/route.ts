import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiRequest } from "@/lib/api-handler";
import { ScanQRInput } from "@/lib/types";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { getActiveSession, getSessionOrThrow } from "@/lib/attendance/session";
import { recordScan, getSessionStats } from "@/lib/attendance/scan";

// name / lastName / email live on `users`, joined via participants.user_id
const withUser = {
  user: { select: { id: true, email: true, name: true, lastName: true } },
} as const;

// POST /api/scan — toggle a participant's presence in the active session.
// Body: { qrCode: "<participant id>", sessionId?, stationId? }
export async function POST(req: NextRequest) {
  return handleApiRequest(async () => {
    const body = (await req.json()) as ScanQRInput;
    const id = body.qrCode?.trim();

    if (!id) {
      throw new ValidationError("QR code is required");
    }

    const session = body.sessionId
      ? await getSessionOrThrow(body.sessionId)
      : await getActiveSession();

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
      participantId: participant.id,
      session,
      stationId: body.stationId,
    });

    return {
      participant,
      session: {
        id: session.id,
        title: session.title,
        breakAllowanceMinutes: session.breakAllowanceMinutes,
        audience: session.audience,
      },
      ...outcome,
      stats: await getSessionStats(session),
    };
  }, req);
}

// GET /api/scan — all registered participants (handy for testing without badges)
export async function GET(req: NextRequest) {
  return handleApiRequest(async () => {
    return prisma.participant.findMany({
      include: withUser,
      orderBy: { user: { lastName: "asc" } },
    });
  }, req);
}
