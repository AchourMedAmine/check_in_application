"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useMe } from "@/hooks/useMe";

const NAV = [
  { href: "/", label: "Sessions" },
  { href: "/standings", label: "Standings" },
];

/**
 * Logo, the two pages, and who is signed in. Hidden on the login screen,
 * which carries its own logo.
 */
export default function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  // The bar outlives client navigation, so re-ask once we leave /login.
  const me = useMe(pathname !== "/login");

  if (pathname === "/login") return null;

  const signOut = async () => {
    setBusy(true);
    await global.fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  return (
    <header className="topbar">
      <div className="topbar-inner">
        {/* Plain anchors, not <Link>: the root layout is also rendered for
            the global error page, which has no router context. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- see above */}
        <a href="/" aria-label="TRSYP check-in, sessions">
          <Image
            src="/trsyp-logo.webp"
            alt="TRSYP"
            width={112}
            height={20}
            className="topbar-logo"
            priority
            // Already a 15 KB WebP; re-encoding would drop its transparency
            // for clients that don't ask for a format.
            unoptimized
          />
        </a>

        <nav className="topbar-nav" aria-label="Pages">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="topbar-link"
              aria-current={pathname === item.href ? "page" : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="topbar-user">
          {me && (
            <span className="topbar-name">
              <strong>{me.displayName}</strong>
              {me.role === "Manager" ? ", manager" : ""}
            </span>
          )}
          <button
            type="button"
            onClick={signOut}
            disabled={busy}
            className="link-btn"
          >
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </header>
  );
}
