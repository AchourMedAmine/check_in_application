"use client";

import { useEffect, useState } from "react";
import type { ScannerProfile } from "@/lib/types";

/**
 * The signed-in scanner; null until loaded (or when signed out).
 * Pass `enabled = false` to skip the request, e.g. on the login screen;
 * flipping it back to true fetches again.
 */
export function useMe(enabled = true) {
  const [me, setMe] = useState<ScannerProfile | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const res = await global.fetch("/api/auth/me").catch(() => null);
      if (!res?.ok || cancelled) return;
      const body = await res.json();
      if (!cancelled) setMe(body.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return me;
}
