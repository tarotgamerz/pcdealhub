import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!process.env.TAROTAI_ACCESS_CODE) return NextResponse.json({ error: "Private access is not configured." }, { status: 503 });
  if (!isAuthorized(request)) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  return NextResponse.json({ error: "Provider integration pending." }, { status: 501, headers: { "Cache-Control": "no-store" } });
}
