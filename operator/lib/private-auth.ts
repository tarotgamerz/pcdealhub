import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "pcdealhub_operator";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function getSecret() {
  const secret = process.env.OPERATOR_SESSION_SECRET;
  if (!secret) throw new Error("OPERATOR_SESSION_SECRET is not configured.");
  return secret;
}

function sign(value: string) {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function makeOperatorSession() {
  const payload = Buffer.from(JSON.stringify({
    sub: "owner",
    exp: Date.now() + MAX_AGE_SECONDS * 1000,
  })).toString("base64url");
  return payload + "." + sign(payload);
}

export function verifyOperatorSession(value: string | undefined) {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 2) return false;
  const payload = parts[0];
  const signature = parts[1];
  if (!payload || !signature) return false;
  if (!safeEqual(signature, sign(payload))) return false;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: string; exp?: number };
    return parsed.sub === "owner" && typeof parsed.exp === "number" && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

export async function hasOperatorSession() {
  const jar = await cookies();
  return verifyOperatorSession(jar.get(COOKIE_NAME)?.value);
}

export const operatorCookie = COOKIE_NAME;
export const operatorMaxAge = MAX_AGE_SECONDS;
