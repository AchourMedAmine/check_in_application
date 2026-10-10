"use client";

import { Scanner, type IDetectedBarcode } from "@yudiel/react-qr-scanner";

interface CameraScannerProps {
  onDecode: (value: string) => void;
  /** Freeze detection (e.g. while the previous lookup is in flight). */
  paused?: boolean;
  onError?: (message: string) => void;
}

/**
 * Phone/laptop camera QR reader. Loaded with `ssr: false` — never import
 * this directly from a server component.
 */
export default function CameraScanner({
  onDecode,
  paused = false,
  onError,
}: CameraScannerProps) {
  const handleScan = (codes: IDetectedBarcode[]) => {
    const value = codes[0]?.rawValue;
    if (value) onDecode(value);
  };

  return (
    <div className="scan-viewport">
      <Scanner
        onScan={handleScan}
        onError={(err) => onError?.(err?.message ?? "Camera error")}
        formats={["qr_code"]}
        paused={paused}
        // Keep firing so a second participant can be scanned without
        // moving the phone away; the parent de-duplicates repeats.
        allowMultiple
        scanDelay={1500}
        constraints={{ facingMode: "environment" }}
        // Our own neutral finder (globals.css): the library's is red, and
        // red/pink means "checked out" everywhere else in the app.
        components={{ finder: false, torch: true }}
        styles={{
          container: { width: "100%", height: "100%" },
          video: { width: "100%", height: "100%", objectFit: "cover" },
        }}
        sound
      />
    </div>
  );
}
