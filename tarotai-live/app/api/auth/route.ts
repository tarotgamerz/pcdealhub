import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = request.headers.get("cookie")?.split(";").some(v => v.trim() === "tarotai_session=authorized") ?? false;
  return NextResponse.json({
    authenticated: session,
    accessCodeConfigured: Boolean(process.env.TAROTAI_ACCESS_CODE)
  });
}

export async function POST(request: Request) {
  let body: any = {};
  try { body = await request.json(); } catch {}
  const required = process.env.TAROTAI_ACCESS_CODE;
  if (!required) {
    return NextResponse.json(
      { error: "Private access is not configured. Set TAROTAI_ACCESS_CODE in Vercel Production, then redeploy." },
      { status: 503 }
    );
  }
  if (body?.code !== required) return NextResponse.json({ error: "Access denied" }, { status: 401 });
  const response = NextResponse.json({ authenticated: true });
  response.cookies.set("tarotai_session","authorized",{httpOnly:true,secure:true,sameSite:"strict",path:"/",maxAge:60*60*24*30});
  const existingUser = request.headers.get("cookie")?.split(";").find((v) => v.trim().startsWith("tarotai_user="));
  if (!existingUser) {
    response.cookies.set("tarotai_user", crypto.randomUUID(), {httpOnly:true,secure:true,sameSite:"strict",path:"/",maxAge:60*60*24*365});
  }
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set("tarotai_session","",{httpOnly:true,secure:true,sameSite:"strict",path:"/",maxAge:0});
  return response;
}
