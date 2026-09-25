import { NextResponse } from "next/server";
import { operatorCookie } from "../../../lib/private-auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: operatorCookie,
    value: "",
    maxAge: 0,
    path: "/",
  });
  return response;
}
