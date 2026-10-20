import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { isAuthorized } from "../../../lib/auth";

export const runtime = "nodejs";
const COOKIE = "tarotai_session";
const MAX_FAILED_ATTEMPTS = 8;
const LOCKOUT_SECONDS = 15 * 60;
const secret = () => process.env.TAROTAI_ACCESS_CODE || "";

type LocalFailure = { count: number; expiresAt: number };
const localFailures = new Map<string, LocalFailure>();

const privateHeaders = {
  "Cache-Control": "no-store, private",
  "Pragma": "no-cache"
};

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...privateHeaders, ...extraHeaders } });
}

function clientAddress(request: Request) {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 128);
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || "unknown").slice(0, 128);
}

function attemptKey(request: Request, accessSecret: string) {
  const address = clientAddress(request);
  const fingerprint = createHmac("sha256", accessSecret).update("tarotai-auth-attempt:" + address).digest("hex");
  return "tarotai:auth:attempts:" + fingerprint.slice(0, 32);
}

function localCount(key: string) {
  const now = Date.now();
  for (const [storedKey, value] of localFailures) {
    if (value.expiresAt <= now) localFailures.delete(storedKey);
  }
  const entry = localFailures.get(key);
  if (!entry || entry.expiresAt <= now) {
    localFailures.delete(key);
    return 0;
  }
  return entry.count;
}

function localRecordFailure(key: string) {
  const now = Date.now();
  const current = localFailures.get(key);
  const entry = current && current.expiresAt > now
    ? { count: current.count + 1, expiresAt: current.expiresAt }
    : { count: 1, expiresAt: now + LOCKOUT_SECONDS * 1000 };
  localFailures.set(key, entry);
  if (localFailures.size > 2000) {
    for (const [storedKey, value] of localFailures) {
      if (value.expiresAt <= now) localFailures.delete(storedKey);
    }
  }
  return entry.count;
}

function redisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

async function failureCount(key: string) {
  try {
    const redis = redisClient();
    if (redis) return Number((await redis.get<string | number>(key)) || 0);
  } catch {
    // Fail over to an in-process limiter when the shared store is unavailable.
  }
  return localCount(key);
}

async function recordFailure(key: string) {
  try {
    const redis = redisClient();
    if (redis) {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, LOCKOUT_SECONDS);
      return count;
    }
  } catch {
    // Fail over to an in-process limiter when the shared store is unavailable.
  }
  return localRecordFailure(key);
}

async function clearFailures(key: string) {
  localFailures.delete(key);
  try {
    const redis = redisClient();
    if (redis) await redis.del(key);
  } catch {
    // A stale counter expires automatically.
  }
}

export async function GET(request: Request) {
  return json({
    authenticated: isAuthorized(request),
    accessCodeConfigured: Boolean(secret())
  });
}

export async function POST(request: Request) {
  const expected = secret();
  if (!expected) {
    return json({
      error: "Private access is not configured. Set TAROTAI_ACCESS_CODE and redeploy."
    }, 503);
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > 4096) return json({ error: "Sign-in request is too large." }, 413);

  let rawBody = "";
  try {
    rawBody = await request.text();
  } catch {
    return json({ error: "Could not read sign-in request." }, 400);
  }
  if (Buffer.byteLength(rawBody, "utf8") > 4096) return json({ error: "Sign-in request is too large." }, 413);

  let body: unknown;
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return json({ error: "Expected a valid JSON sign-in request." }, 400);
  }

  const key = attemptKey(request, expected);
  const attempts = await failureCount(key);
  if (attempts >= MAX_FAILED_ATTEMPTS) {
    return json(
      { error: "Too many failed attempts. Try again in about 15 minutes." },
      429,
      { "Retry-After": String(LOCKOUT_SECONDS) }
    );
  }

  const value = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>).code
    : undefined;
  const supplied = typeof value === "string" && value.length <= 256 ? value : "";
  const actualBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  const matches = actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);

  if (!matches) {
    await recordFailure(key);
    return json({ error: "Access denied" }, 401);
  }

  await clearFailures(key);
  const payload = Buffer.from(JSON.stringify({
    sub: "owner",
    exp: Date.now() + 8 * 60 * 60 * 1000,
    nonce: randomUUID()
  })).toString("base64url");

  const response = json({ authenticated: true, expiresInSeconds: 28800 });
  response.cookies.set(COOKIE, payload + "." + createHmac("sha256", expected).update(payload).digest("hex"), {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 8 * 60 * 60
  });
  return response;
}

export async function DELETE() {
  const response = json({ authenticated: false });
  response.cookies.set(COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0
  });
  return response;
}
