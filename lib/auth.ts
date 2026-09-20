/**
 * Staff gate.
 *
 * The whole app is a scanning station: anyone who can reach it can move
 * participants in and out and read the roster. A single shared PIN is the
 * lightest thing that keeps a public URL from being an open door.
 *
 * The cookie holds HMAC(STAFF_PIN) rather than the PIN itself, so the PIN is
 * never echoed back to the browser. Changing STAFF_PIN invalidates every
 * existing session.
 */
export const STAFF_COOKIE = "trsyp_staff";

/** One long event day. */
export const STAFF_COOKIE_MAX_AGE = 60 * 60 * 14;

const DOMAIN = "trsyp-checkin-v1";

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The cookie value a correct PIN produces. Works in Node and Edge runtimes. */
export async function staffToken(pin: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(DOMAIN)
  );
  return hex(sig);
}

/** Constant-time string compare, so the token can't be guessed byte by byte. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * True when the request carries a valid staff cookie.
 * Fails closed: with no STAFF_PIN configured, nobody gets in.
 */
export async function isStaffToken(token: string | undefined): Promise<boolean> {
  const pin = process.env.STAFF_PIN;
  if (!pin || !token) return false;
  return safeEqual(token, await staffToken(pin));
}
