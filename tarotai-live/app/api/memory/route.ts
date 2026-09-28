import { redis, memoryKey, privateUserId, authorized, forbiddenMemoryKey, memoryEnabled } from "@/lib/store";

type MemoryItem = { key: string; value: string; updatedAt: string };

async function load(userId: string): Promise<MemoryItem[]> {
  const data = (await (redis as any)!.get(memoryKey(userId))) as MemoryItem[] | null;
  return Array.isArray(data) ? data.slice(0, 100) : [];
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!memoryEnabled()) return Response.json({ enabled: false, items: [] });
  const userId = privateUserId(request);
  if (!userId) return Response.json({ error: "Private session identity missing." }, { status: 401 });
  return Response.json({ enabled: true, items: await load(userId) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!memoryEnabled()) return Response.json({ error: "Durable memory is not configured." }, { status: 503 });
  const userId = privateUserId(request);
  if (!userId) return Response.json({ error: "Private session identity missing." }, { status: 401 });
  const body: any = await request.json().catch(() => ({}));
  const key = String(body?.key ?? "").trim().slice(0, 80);
  const value = String(body?.value ?? "").trim().slice(0, 2000);
  if (!key || !value) return Response.json({ error: "key and value are required." }, { status: 400 });
  if (forbiddenMemoryKey(key)) return Response.json({ error: "Sensitive credentials and secrets cannot be stored in durable memory." }, { status: 400 });
  const items = (await load(userId)).filter((item) => item.key !== key);
  const item: MemoryItem = { key, value, updatedAt: new Date().toISOString() };
  items.unshift(item);
  await (redis as any)!.set(memoryKey(userId), items.slice(0, 100));
  return Response.json({ ok: true, item }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!memoryEnabled()) return Response.json({ error: "Durable memory is not configured." }, { status: 503 });
  const userId = privateUserId(request);
  if (!userId) return Response.json({ error: "Private session identity missing." }, { status: 401 });
  const body: any = await request.json().catch(() => ({}));
  const key = String(body?.key ?? "").trim().slice(0, 80);
  if (!key) return Response.json({ error: "key is required." }, { status: 400 });
  const items = await load(userId);
  await (redis as any)!.set(memoryKey(userId), items.filter((item) => item.key !== key));
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
