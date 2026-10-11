import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "tarotai_session";
const secret = () => process.env.TAROTAI_ACCESS_CODE || "";
type SessionPayload = Record<string, unknown> & { exp: number; nonce: string };

function readSession(request: Request): SessionPayload | null {
  const raw = request.headers.get("cookie") || "";
  const token = raw
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(COOKIE + "="))
    ?.slice(COOKIE.length + 1) || "";

  try {
    const decoded = decodeURIComponent(token);
    const parts = decoded.split(".");
    const payload = parts[0];
    const signature = parts[1];
    const accessSecret = secret();
    if (!payload || !signature || !accessSecret || parts.length !== 2) return null;

    const expected = createHmac("sha256", accessSecret).update(payload).digest("hex");
    const actualBytes = Buffer.from(signature);
    const expectedBytes = Buffer.from(expected);
    if (
      actualBytes.length !== expectedBytes.length ||
      !timingSafeEqual(actualBytes, expectedBytes)
    ) return null;

    const value: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const session = value as Record<string, unknown>;
    if (
      typeof session.exp !== "number" ||
      !Number.isFinite(session.exp) ||
      session.exp <= Date.now() ||
      typeof session.nonce !== "string" ||
      session.nonce.length < 1
    ) return null;

    return session as SessionPayload;
  } catch {
    return null;
  }
}

export function isAuthorized(request: Request) {
  return readSession(request) !== null;
}

/**
 * This deployment has one owner, not multi-tenant accounts. Read identity only
 * after verifying the signed session; never trust a standalone identity cookie.
 * The owner fallback keeps existing signed sessions valid across this upgrade.
 */
export function sessionUserId(request: Request): string | null {
  const session = readSession(request);
  if (!session) return null;
  const sub = session.sub;
  return typeof sub === "string" && sub.trim() ? sub.trim().slice(0, 100) : "owner";
}
