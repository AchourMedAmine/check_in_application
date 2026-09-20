"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim() || busy) return;

    setBusy(true);
    setError(null);

    const res = await global.fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });

    setBusy(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Sign in failed");
      setPin("");
      return;
    }

    // Full navigation so the proxy re-runs with the new cookie.
    router.replace(params.get("next") || "/");
    router.refresh();
  };

  return (
    <div className="max-w-sm mx-auto mt-[12vh]">
      <form onSubmit={submit} className="admin-card p-6 space-y-4">
        <div className="space-y-1 text-center">
          <h1 className="admin-heading text-xl font-bold">
            TRSYP<span style={{ color: "var(--color-green)" }}> CHECK-IN</span>
          </h1>
          <p className="text-sm text-[var(--viz-ink-muted)]">
            Staff access only
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="pin" className="viz-tile-label block">
            Staff PIN
          </label>
          <input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="admin-input w-full px-4 py-3 text-center text-lg tracking-[0.3em]"
            placeholder="••••••"
          />
        </div>

        {error && <div className="scan-error">{error}</div>}

        <button
          type="submit"
          disabled={busy || !pin.trim()}
          className="admin-btn-primary w-full px-4 py-3 text-xs"
        >
          {busy ? "Checking…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
