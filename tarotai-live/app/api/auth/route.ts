import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";

export const runtime = "nodejs";
const COOKIE = "tarotai_session";
function key() { return process.env.TAROTAI_ACCESS_CODE || ""; }
function sign(payload: string) {
  const secret = key();
  if (!secret) return "";
  return createHmac("sha256", secret).update(payload).digest("hex");
}
function tokenValid(token: string) {
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !key()) return false;
  const expected = sign(payload);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.exp > Date.now() && typeof data.nonce === "string";
  } catch { return false; }
}
export function isAuthorized(request: Request) {
  const raw = request.headers.get("cookie") || "";
  const value = raw.split(";").map(v => v.trim()).find(v => v.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1) || "";
  return tokenValid(decodeURIComponent(value));
}
export async function GET(request: Request) {
  return NextResponse.json({ authenticated: isAuthorized(request), accessCodeConfigured: Boolean(key()) });
}
export async function POST(request: Request) {
  let body: any = {};
  try { body = await request.json(); } catch {}
  const required = key();
  if (!required) return NextResponse.json({ error: "Private access is not configured. Set TAROTAI_ACCESS_CODE in Vercel and redeploy." }, { status: 503 });
  const supplied = typeof body?.code === "string" ? body.code : "";
  const a = Buffer.from(supplied), b = Buffer.from(required);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "Access denied" }, { status: 401 });
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 8 * 60 * 60 * 1000, nonce: randomUUID() })).toString("base64url");
  const response = NextResponse.json({ authenticated: true, expiresInSeconds: 28800 });
  response.cookies.set(COOKIE, payload + "." + sign(payload), { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 8 * 60 * 60 });
  return response;
}
export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(COOKIE, "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
