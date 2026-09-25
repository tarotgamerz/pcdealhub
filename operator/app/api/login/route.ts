import { NextResponse } from "next/server";
import { makeOperatorSession, operatorCookie, operatorMaxAge } from "../../../lib/private-auth.js";

export async function POST(request: Request) {
  const configured = process.env.OPERATOR_PASSWORD;
  if (!configured) {
    return NextResponse.json({ error: "Operator password is not configured." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { password?: string } | null;
  if (!body?.password || body.password !== configured) {
    return NextResponse.json({ error: "Invalid password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: operatorCookie,
    value: makeOperatorSession(),
    httpOnly: true,
    maxAge: operatorMaxAge,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
