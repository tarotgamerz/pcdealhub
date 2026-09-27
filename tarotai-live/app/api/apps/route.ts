import { Composio } from "@composio/core";
import { authorized, memoryEnabled, privateUserId } from "@/lib/store";

function config() {
  return {
    hasKey: Boolean(process.env.COMPOSIO_API_KEY),
    callbackUrl: "https://tarotai-core.vercel.app/console.html?connected=1"
  };
}

async function sessionFor(request: Request) {
  if (!config().hasKey) return null;
  const userId = privateUserId(request);
  if (!userId) throw new Error("Private session identity missing.");
  const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
  return composio.create(userId);
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!config().hasKey) {
    return Response.json({
      enabled: false,
      message: "Connected apps are not configured. Add COMPOSIO_API_KEY in Vercel Production."
    });
  }
  try {
    const session = await sessionFor(request);
    const result = await session!.toolkits({ limit: 20 });
    return Response.json({
      enabled: true,
      items: result.items.map((item: any) => ({
        slug: item.slug,
        name: item.name,
        logo: item.logo || null,
        isNoAuth: Boolean(item.isNoAuth),
        connected: Boolean(item.connection?.isActive)
      }))
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: "Could not load connected apps: " + (error instanceof Error ? error.message : String(error)) },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!config().hasKey) return Response.json({ error: "COMPOSIO_API_KEY is not configured in Vercel Production." }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const toolkit = String(body?.toolkit ?? "").trim().toLowerCase().slice(0, 80);
  if (!/^[a-z0-9_-]+$/.test(toolkit)) return Response.json({ error: "Invalid toolkit slug." }, { status: 400 });

  try {
    const session = await sessionFor(request);
    const requestData = await session!.authorize(toolkit, { callbackUrl: config().callbackUrl });
    return Response.json({
      ok: true,
      toolkit,
      redirectUrl: requestData?.redirectUrl || requestData?.redirect_url || null
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: "App authorization failed: " + (error instanceof Error ? error.message : String(error)) },
      { status: 502 }
    );
  }
}
