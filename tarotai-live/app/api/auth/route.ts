import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = request.headers.get("cookie")?.split(";").some(v => v.trim() === "tarotai_session=authorized") ?? false;
  return NextResponse.json({ authenticated: session || !process.env.TAROTAI_ACCESS_CODE });
}

export async function POST(request: Request) {
  let body: any = {};
  try { body = await request.json(); } catch {}
  const required = process.env.TAROTAI_ACCESS_CODE;
  if (required && body?.code !== required) return NextResponse.json({ error: "Access denied" }, { status: 401 });
  const response = NextResponse.json({ authenticated: true });
  response.cookies.set("tarotai_session","authorized",{httpOnly:true,secure:true,sameSite:"strict",path:"/",maxAge:60*60*24*30});
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set("tarotai_session","",{httpOnly:true,secure:true,sameSite:"strict",path:"/",maxAge:0});
  return response;
}
