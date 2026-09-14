"use client";

import { useState, useRef, useEffect } from "react";
import { useFetch } from "@/hooks/useFetch";
import { Participant } from "@/lib/types";

interface QRScannerProps {
  onScanSuccess: (participant: Participant) => void;
  onScanError?: (error: string) => void;
}

export default function QRScanner({
  onScanSuccess,
  onScanError,
}: QRScannerProps) {
  const [qrInput, setQrInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { fetch, loading, error } = useFetch<Participant>();

  useEffect(() => {
    // Auto-focus input when component mounts
    inputRef.current?.focus();
  }, []);

  const handleScan = async (qrCode: string) => {
    if (!qrCode.trim()) {
      return;
    }

    const result = await fetch("/api/scan", {
      method: "POST",
      body: JSON.stringify({ qrCode: qrCode.trim() }),
    });

    if (result) {
      onScanSuccess(result);
      setQrInput(""); // Clear input after successful scan
      inputRef.current?.focus(); // Keep focus on input
    } else if (error) {
      onScanError?.(error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQrInput(value);

    // Auto-submit on Enter
    if (value.includes("\n")) {
      handleScan(value.replace("\n", ""));
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleScan(qrInput);
    }
  };

  return (
    <div className="w-full space-y-4">
      <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Scan QR Code
            </label>
            <input
              ref={inputRef}
              type="text"
              value={qrInput}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              placeholder="Scan QR code here..."
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
              autoComplete="off"
            />
          </div>

          <button
            onClick={() => handleScan(qrInput)}
            disabled={loading || !qrInput.trim()}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Scanning..." : "Scan Participant"}
          </button>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
            <p>💡 Tips:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Scanner input is always active</li>
              <li>Scan QR code with barcode scanner</li>
              <li>Only registered participants can be scanned</li>
              <li>Each scan updates the attendance timestamp</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
