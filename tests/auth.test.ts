import { test } from "node:test";
import assert from "node:assert/strict";
import { generatePassword, hashPassword, verifyPassword } from "../lib/password";
import { readSession, signSession, SESSION_MAX_AGE } from "../lib/auth";

process.env.SESSION_SECRET = "test-secret-that-is-at-least-32-characters";

const scanner = { id: "scanner-1", sessionVersion: 3 };
const now = new Date(Date.UTC(2026, 9, 10, 8, 0, 0));
const later = (seconds: number) => new Date(now.getTime() + seconds * 1000);

test("the right password verifies, a wrong one does not", async () => {
  const hash = await hashPassword("correct horse battery");
  assert.equal(await verifyPassword("correct horse battery", hash), true);
  assert.equal(await verifyPassword("correct horse batterY", hash), false);
});

test("the same password hashes differently each time (salted)", async () => {
  assert.notEqual(await hashPassword("same"), await hashPassword("same"));
});

test("a malformed stored hash never verifies", async () => {
  assert.equal(await verifyPassword("x", "not-a-hash"), false);
  assert.equal(await verifyPassword("x", ""), false);
});

test("generated passwords are 4 groups of 4 unambiguous characters", () => {
  const pw = generatePassword();
  assert.match(pw, /^[a-km-np-z2-9]{4}(-[a-km-np-z2-9]{4}){3}$/);
  assert.notEqual(generatePassword(), pw);
});

test("a signed session reads back with its scanner and version", async () => {
  const claim = await readSession(await signSession(scanner, now), now);
  assert.equal(claim?.sid, "scanner-1");
  assert.equal(claim?.v, 3);
});

test("a session expires after one event day", async () => {
  const token = await signSession(scanner, now);
  assert.ok(await readSession(token, later(SESSION_MAX_AGE - 1)));
  assert.equal(await readSession(token, later(SESSION_MAX_AGE)), null);
});

test("an edited cookie is rejected", async () => {
  const token = await signSession(scanner, now);
  const [, signature] = token.split(".");
  const forged = Buffer.from(
    JSON.stringify({ sid: "someone-else", v: 3, exp: 9_999_999_999 })
  ).toString("base64url");
  assert.equal(await readSession(`${forged}.${signature}`, now), null);
});

test("a cookie signed with another secret is rejected", async () => {
  const token = await signSession(scanner, now);
  process.env.SESSION_SECRET = "a-different-secret-also-32-characters-long";
  try {
    assert.equal(await readSession(token, now), null);
  } finally {
    process.env.SESSION_SECRET = "test-secret-that-is-at-least-32-characters";
  }
});

test("no secret, or a short one, means nobody is signed in", async () => {
  const token = await signSession(scanner, now);
  const saved = process.env.SESSION_SECRET;
  try {
    delete process.env.SESSION_SECRET;
    assert.equal(await readSession(token, now), null);
    process.env.SESSION_SECRET = "too-short";
    assert.equal(await readSession(token, now), null);
    await assert.rejects(signSession(scanner, now));
  } finally {
    process.env.SESSION_SECRET = saved;
  }
});

test("garbage cookies are rejected, not thrown", async () => {
  for (const junk of [undefined, "", ".", "abc", "a.b", "!!!.???", "a.b.c"]) {
    assert.equal(await readSession(junk, now), null);
  }
});
