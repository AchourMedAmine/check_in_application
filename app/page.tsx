"use client";

import { useState } from "react";
import QRScanner from "@/components/QRScanner";
import ScannedParticipants from "@/components/ScannedParticipants";
import { useScannedParticipants } from "@/hooks/useScannedParticipants";
import { Participant } from "@/lib/types";

export default function Home() {
  const { participants, loading, addParticipant } = useScannedParticipants();
  const [lastScan, setLastScan] = useState<Participant | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  const handleScanSuccess = (participant: Participant) => {
    setLastScan(participant);
    setShowFeedback(true);
    addParticipant(participant);

    // Auto-hide feedback after 3 seconds
    setTimeout(() => setShowFeedback(false), 3000);
  };

  const handleScanError = (error: string) => {
    console.error("Scan error:", error);
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold">QR Code Scanner</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Scan participant QR codes to register attendance
        </p>
      </div>

      {/* Feedback */}
      {showFeedback && lastScan && (
        <div className="p-4 rounded-lg text-white text-center font-semibold animate-pulse bg-green-500">
          ✓ Participant Scanned!
          {lastScan.name && ` (${lastScan.name})`}
        </div>
      )}

      {/* Scanner */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6 shadow-sm">
        <QRScanner
          onScanSuccess={handleScanSuccess}
          onScanError={handleScanError}
        />
      </div>

      {/* Scanned List */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6 shadow-sm">
        <ScannedParticipants participants={participants} loading={loading} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
            {participants.length}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Total Scanned
          </div>
        </div>

        <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-green-600 dark:text-green-400">
            {participants.filter((p) => p.name).length}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            With Name
          </div>
        </div>

        <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
            {participants.filter((p) => p.email).length}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            With Email
          </div>
        </div>
      </div>
    </div>
  );
}
