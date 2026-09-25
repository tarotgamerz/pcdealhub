import { NextResponse } from "next/server";
import {
  createSessionCookie,
  getCookieName,
  sessionCookieOptions,
  verifyOwnerPassword,
} from "../../../../lib/auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { password?: string };
  const password = typeof body.password === "string" ? body.password : "";

  if (!(await verifyOwnerPassword(password))) {
    return NextResponse.json({ ok: false, error: "Invalid password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(getCookieName(), await createSessionCookie(), sessionCookieOptions);
  return response;
}