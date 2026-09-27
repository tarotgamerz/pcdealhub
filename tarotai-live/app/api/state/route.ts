import { redis, stateKey, memoryEnabled, privateUserId, authorized } from "@/lib/store";

type StoredState = {
  messages: Array<{role:"user"|"assistant";content:string;toolEvents?:unknown[]}>;
  tasks: Array<Record<string, unknown>>;
  updatedAt: string;
};

function cleanState(body: any): StoredState {
  const messages = Array.isArray(body?.messages)
    ? body.messages
        .filter((m: any) => m && (m.role === "user" || m.role === "assistant"))
        .map((m: any) => ({
          role: m.role,
          content: String(m.content ?? "").slice(0, 12000),
          ...(Array.isArray(m.toolEvents) ? { toolEvents: m.toolEvents.slice(0, 20) } : {})
        }))
        .slice(-60)
    : [];
  const tasks = Array.isArray(body?.tasks)
    ? body.tasks.slice(0, 100).map((task: any) => ({
        title: String(task?.title ?? "").slice(0, 500),
        status: String(task?.status ?? "unknown").slice(0, 40),
        createdAt: String(task?.createdAt ?? "").slice(0, 80),
        ...(task?.result ? { result: String(task.result).slice(0, 8000) } : {})
      }))
    : [];
  return { messages, tasks, updatedAt: new Date().toISOString() };
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!memoryEnabled()) return Response.json({ enabled: false, messages: [], tasks: [] });
  const userId = privateUserId(request);
  if (!userId) return Response.json({ error: "Private session identity missing." }, { status: 401 });
  const state = await redis!.get<StoredState>(stateKey(userId));
  return Response.json(
    { enabled: true, messages: Array.isArray(state?.messages) ? state.messages : [], tasks: Array.isArray(state?.tasks) ? state.tasks : [] },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!memoryEnabled()) return Response.json({ error: "Durable state is not configured." }, { status: 503 });
  const userId = privateUserId(request);
  if (!userId) return Response.json({ error: "Private session identity missing." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const state = cleanState(body);
  await redis!.set(stateKey(userId), state);
  return Response.json({ ok: true, updatedAt: state.updatedAt }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!memoryEnabled()) return Response.json({ error: "Durable state is not configured." }, { status: 503 });
  const userId = privateUserId(request);
  if (!userId) return Response.json({ error: "Private session identity missing." }, { status: 401 });
  await redis!.del(stateKey(userId));
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
