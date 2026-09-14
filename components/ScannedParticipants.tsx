"use client";

import { Participant } from "@/lib/types";
import { format } from "date-fns";

interface ScannedParticipantsProps {
  participants: Participant[];
  loading?: boolean;
}

export default function ScannedParticipants({
  participants,
  loading,
}: ScannedParticipantsProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">Loading participants...</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">
          Scanned Participants ({participants.length})
        </h3>
      </div>

      {participants.length === 0 ? (
        <div className="text-center text-gray-500 py-8 bg-gray-50 dark:bg-gray-900 rounded-lg">
          No participants scanned yet
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  QR Code
                </th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  Name
                </th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  Email
                </th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  Scanned
                </th>
              </tr>
            </thead>
            <tbody>
              {participants.map((participant) => (
                <tr
                  key={participant.id}
                  className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                >
                  <td className="py-3 px-4 font-mono text-xs text-gray-600 dark:text-gray-400 truncate">
                    {participant.qrCode}
                  </td>
                  <td className="py-3 px-4 text-gray-900 dark:text-white">
                    {participant.name || "-"}
                  </td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
                    {participant.email || "-"}
                  </td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-400 text-xs">
                    {format(new Date(participant.scannedAt), "PPpp")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
