"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
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
    <div className="login">
      <Image
        src="/trsyp-logo.webp"
        alt="TRSYP"
        width={157}
        height={28}
        className="login-logo"
        priority
        // Already a 15 KB WebP; re-encoding would drop its transparency
        // for clients that don't ask for a format.
        unoptimized
      />

      <h1 className="login-title">Sign in to scan badges</h1>
      <p className="login-lede">
        Use the scanner account a manager gave you.
      </p>

      <form onSubmit={submit} className="login-form">
        <div className="field">
          <label htmlFor="username" className="field-label">
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
            className="input"
          />
        </div>

        <div className="field">
          <label htmlFor="password" className="field-label">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
          />
        </div>

        {error && (
          <div className="notice" role="alert">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !username.trim() || !password}
          className="btn btn--primary btn--block"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
