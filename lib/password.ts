import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Password hashing for scanner accounts, on Node's built-in scrypt.
 *
 * Stored as `scrypt$N$r$p$salt$hash` (salt and hash base64), so the cost
 * parameters travel with each hash and can be raised later without breaking
 * existing accounts.
 */
const N = 16_384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

/** Shortest password the app accepts. */
export const MIN_PASSWORD_LENGTH = 10;

function derive(
  password: string,
  salt: Buffer,
  n: number,
  r: number,
  p: number,
  keyLength: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key)
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, N, R, P, KEY_LENGTH);
  return ["scrypt", N, R, P, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;

  const expected = Buffer.from(hash, "base64");
  const actual = await derive(
    password,
    Buffer.from(salt, "base64"),
    Number(n),
    Number(r),
    Number(p),
    expected.length
  );
  return timingSafeEqual(actual, expected);
}

/**
 * Burns the same time as a real check. Run for unknown usernames, so response
 * time does not reveal which usernames exist.
 */
const DUMMY_HASH = hashPassword("not-a-real-account");
export async function verifyAgainstDummy(password: string): Promise<void> {
  await verifyPassword(password, await DUMMY_HASH);
}

/** A random password that is easy to read out loud: 4 groups of 4. */
export function generatePassword(): string {
  // No 0/O, 1/l/I: these get misread when handed over on paper.
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(16);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join("")).join("-");
}
