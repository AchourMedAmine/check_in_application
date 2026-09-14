import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiRequest } from "@/lib/api-handler";
import { ScanQRInput, ScannedResult } from "@/lib/types";
import { ValidationError } from "@/lib/errors";

// POST /api/scan - Scan QR code (existing participants only)
export async function POST(req: NextRequest) {
  return handleApiRequest(async () => {
    const body = (await req.json()) as ScanQRInput;

    // Validation
    if (!body.qrCode || body.qrCode.trim() === "") {
      throw new ValidationError("QR code is required");
    }

    // Find participant by QR code
    const participant = await prisma.participant.findUnique({
      where: { qrCode: body.qrCode },
    });

    // Only allow scanning existing participants
    if (!participant) {
      throw new ValidationError(
        "Participant not found. QR code not registered."
      );
    }

    // Update scan time
    const updated = await prisma.participant.update({
      where: { qrCode: body.qrCode },
      data: {
        scannedAt: new Date(),
      },
    });

    return updated;
  }, req);
}

// GET /api/scan - Get all scanned participants
export async function GET(req: NextRequest) {
  return handleApiRequest(async () => {
    const participants = await prisma.participant.findMany({
      orderBy: {
        scannedAt: "desc",
      },
    });

    return participants;
  }, req);
}
