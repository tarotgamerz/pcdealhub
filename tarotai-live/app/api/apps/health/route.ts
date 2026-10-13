import { Composio } from "@composio/core";
import { authorized, privateUserId } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "Authentication required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (!process.env.COMPOSIO_API_KEY) {
    return Response.json({ ok: false, status: "missing_key" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const userId = privateUserId(request);
  if (!userId) {
    return Response.json({ ok: false, status: "missing_session" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
    const session = await composio.create(userId);
    const result: any = await session.tools();
    const list = Array.isArray(result) ? result : Array.isArray(result?.tools) ? result.tools : [];
    const names = list.map((item: any) => String(item?.function?.name || item?.name || "").trim()).filter(Boolean);
    return Response.json({
      ok: true,
      status: "connected",
      toolCount: names.length,
      sampleTools: names.slice(0, 8),
      checkedAt: new Date().toISOString(),
      note: "Session and tool discovery tested; individual app connections may still require authorization."
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Composio health check failed", message);
    return Response.json({ ok: false, status: "connection_error", message: message.slice(0, 350) }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
