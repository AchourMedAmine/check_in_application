"use client";

import { useState, useCallback } from "react";

interface FetchOptions extends RequestInit {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
}

export function useFetch<T = unknown>() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(
    async (url: string, options?: FetchOptions): Promise<T | null> => {
      setLoading(true);
      setError(null);

      try {
        // Relative URL on purpose: it resolves against whatever origin the
        // page is served from, so the same code works on localhost, on a
        // Vercel preview and in production. Never prefix a hard-coded host —
        // in the browser that would point at the visitor's own machine.
        const response = await global.fetch(url, {
          headers: {
            "Content-Type": "application/json",
            ...options?.headers,
          },
          ...options,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Request failed");
        }

        const data = await response.json();
        return data.data;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { fetch, loading, error };
}
