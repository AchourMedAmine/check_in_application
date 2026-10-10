"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useMe } from "@/hooks/useMe";

export default function SignOutButton() {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  // The header outlives client navigation, so re-ask once we leave /login.
  const me = useMe(pathname !== "/login");

  // Nothing to sign out of on the login screen.
  if (pathname === "/login") return null;

  const signOut = async () => {
    setBusy(true);
    await global.fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  return (
    <>
      {me && (
        <span className="admin-header-name">
          {me.displayName}
          {me.role === "Manager" ? " · Manager" : ""}
        </span>
      )}
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        className="admin-btn-secondary px-3 py-1.5 text-[11px]"
      >
        {busy ? "…" : "Sign out"}
      </button>
    </>
  );
}
