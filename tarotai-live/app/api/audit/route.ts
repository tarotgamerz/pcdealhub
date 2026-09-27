import { redis, auditKey, memoryEnabled, privateUserId, authorized } from "@/lib/store";

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!memoryEnabled()) return Response.json({ enabled: false, events: [] });
  const userId = privateUserId(request);
  if (!userId) return Response.json({ error: "Private session identity missing." }, { status: 401 });

  const events = await redis!.lrange<string>(auditKey(userId), 0, 99);
  return Response.json(
    {
      enabled: true,
      events: events.map((item) => {
        try { return JSON.parse(item); } catch { return { raw: item }; }
      })
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function DELETE(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!memoryEnabled()) return Response.json({ error: "Durable state is not configured." }, { status: 503 });
  const userId = privateUserId(request);
  if (!userId) return Response.json({ error: "Private session identity missing." }, { status: 401 });
  await redis!.del(auditKey(userId));
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
