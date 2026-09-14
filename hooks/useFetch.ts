"use client";

import { useState, useCallback } from "react";

interface FetchOptions extends RequestInit {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
}

export function useFetch<T = any>() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(
    async (url: string, options?: FetchOptions): Promise<T | null> => {
      setLoading(true);
      setError(null);

      try {
        const baseUrl =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
        const response = await global.fetch(`${baseUrl}${url}`, {
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
