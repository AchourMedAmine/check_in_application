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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password || busy) return;

    setBusy(true);
    setError(null);

    const res = await global.fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    setBusy(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Sign in failed");
      setPassword("");
      return;
    }

    // Only ever return to a path on this site: "//evil.example" or a full
    // URL in ?next= would turn the login page into an open redirect.
    const next = params.get("next");
    const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/";

    // Full navigation so the proxy re-runs with the new cookie.
    router.replace(safeNext);
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
            Sign in with your scanner account
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="username" className="viz-tile-label block">
            Username
          </label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="admin-input w-full px-4 py-3 text-lg"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="viz-tile-label block">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="admin-input w-full px-4 py-3 text-lg"
          />
        </div>

        {error && <div className="scan-error">{error}</div>}

        <button
          type="submit"
          disabled={busy || !username.trim() || !password}
          className="admin-btn-primary w-full px-4 py-3 text-xs"
        >
          {busy ? "Checking…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
