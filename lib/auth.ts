/**
 * Scanner sessions.
 *
 * After a scanner signs in, the cookie carries a signed claim: which account,
 * which session version, and when it expires. The signature is
 * HMAC-SHA256(SESSION_SECRET), so the cookie cannot be forged or edited.
 *
 * The proxy only checks the signature (no database, it runs on every
 * request). The API routes then load the account itself — see
 * lib/scanners.ts — which is what makes disabling an account, resetting its
 * password and the Manager role take effect immediately.
 */
export const SESSION_COOKIE = "trsyp_scanner";

/** One long event day. */
export const SESSION_MAX_AGE = 60 * 60 * 14;

export interface SessionClaim {
  /** Scanner id. */
  sid: string;
  /** Scanner.sessionVersion when the cookie was issued. */
  v: number;
  /** Expiry, seconds since the epoch. */
  exp: number;
}

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

/**
 * Fails closed: without a long enough secret no cookie is ever valid, and no
 * one can sign in.
 */
function secret(): string | null {
  const s = process.env.SESSION_SECRET;
  return s && s.length >= 32 ? s : null;
}

async function hmac(key: string, data: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, encoder.encode(data)));
}

/** Constant-time compare, so the signature can't be guessed byte by byte. */
function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function signSession(
  scanner: { id: string; sessionVersion: number },
  now: Date = new Date()
): Promise<string> {
  const key = secret();
  if (!key) throw new Error("SESSION_SECRET must be set (32+ characters)");

  const claim: SessionClaim = {
    sid: scanner.id,
    v: scanner.sessionVersion,
    exp: Math.floor(now.getTime() / 1000) + SESSION_MAX_AGE,
  };
  const payload = base64url(encoder.encode(JSON.stringify(claim)));
  return `${payload}.${base64url(await hmac(key, payload))}`;
}

/** The claim inside a valid, unexpired cookie; null for anything else. */
export async function readSession(
  token: string | undefined,
  now: Date = new Date()
): Promise<SessionClaim | null> {
  const key = secret();
  if (!key || !token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  try {
    if (!safeEqual(fromBase64url(signature), await hmac(key, payload))) {
      return null;
    }
    const claim = JSON.parse(new TextDecoder().decode(fromBase64url(payload)));
    if (
      typeof claim?.sid !== "string" ||
      typeof claim?.v !== "number" ||
      typeof claim?.exp !== "number" ||
      claim.exp * 1000 <= now.getTime()
    ) {
      return null;
    }
    return claim as SessionClaim;
  } catch {
    return null; // malformed base64 / JSON
  }
}

export const sessionCookie = (value: string, maxAge = SESSION_MAX_AGE) => ({
  name: SESSION_COOKIE,
  value,
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});
