const COOKIE_NAME = "pcdealhub_operator_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function bytesToBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function base64UrlToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

async function hmac(message: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)),
  );
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

export function getCookieName(): string {
  return COOKIE_NAME;
}

export async function verifyOwnerPassword(candidate: string): Promise<boolean> {
  const configured = process.env.OPERATOR_ACCESS_PASSWORD;
  const secret = process.env.OPERATOR_SESSION_SECRET;
  if (!configured || !secret) return false;
  const expected = await hmac("password-check", configured);
  const actual = await hmac("password-check", candidate);
  return equalBytes(expected, actual);
}

export async function createSessionCookie(): Promise<string> {
  const secret = process.env.OPERATOR_SESSION_SECRET;
  if (!secret) throw new Error("OPERATOR_SESSION_SECRET is not configured");
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `owner.${expiresAt}`;
  const signature = bytesToBase64Url(await hmac(payload, secret));
  return `${payload}.${signature}`;
}

export async function verifySessionCookie(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const secret = process.env.OPERATOR_SESSION_SECRET;
  if (!secret) return false;
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== "owner") return false;
  const expiresAt = Number(parts[1]);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
  const expected = await hmac(`owner.${parts[1]}`, secret);
  let actual: Uint8Array;
  try {
    actual = base64UrlToBytes(parts[2]);
  } catch {
    return false;
  }
  return equalBytes(expected, actual);
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};