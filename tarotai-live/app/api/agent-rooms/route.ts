import { redis, memoryEnabled, privateUserId, authorized, consumeRateLimit } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENTS = [
  { id: "orchestrator", name: "TarotAI Orchestrator", focus: "Task planning and coordination" },
  { id: "market", name: "Market Structure Analyst", focus: "Trend, structure and key levels" },
  { id: "entry", name: "Entry Setup Specialist", focus: "Confirmed entries and no-chase rules" },
  { id: "risk", name: "Risk Manager", focus: "Position sizing and risk controls" },
  { id: "security", name: "Security Reviewer", focus: "Safety, permissions and failure modes" },
  { id: "research", name: "Research Agent", focus: "Evidence, docs and external research" },
  { id: "builder", name: "Build & QA Agent", focus: "Implementation, tests and verification" }
] as const;

type RoomMessage = {
  id: string;
  roomId: string;
  kind: "message" | "task" | "system";
  author: string;
  authorName: string;
  content: string;
  createdAt: string;
  status: "recorded" | "queued";
};

function key(userId: string) { return "tarotai:agent-rooms:" + userId; }
async function load(userId: string): Promise<RoomMessage[]> {
  if (!redis) return [];
  const value = await (redis as any).get(key(userId));
  return Array.isArray(value) ? value.slice(-300) as RoomMessage[] : [];
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!memoryEnabled() || !redis) return Response.json({ error: "Durable room storage is not configured.", storage: "unavailable" }, { status: 503 });
  const userId = privateUserId(request);
  if (!userId) return Response.json({ error: "Private session identity missing." }, { status: 401 });
  const messages = await load(userId);
  return Response.json({ agents: AGENTS, messages, storage: "durable", orchestration: "not-connected" }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!memoryEnabled() || !redis) return Response.json({ error: "Durable room storage is not configured.", storage: "unavailable" }, { status: 503 });
  const userId = privateUserId(request);
  if (!userId) return Response.json({ error: "Private session identity missing." }, { status: 401 });
  const limit = await consumeRateLimit(userId, 40);
  if (!limit.allowed) return Response.json({ error: "Rate limit reached. Please wait a minute." }, { status: 429 });
  const body = await request.json().catch(() => null) as any;
  if (!body || typeof body !== "object") return Response.json({ error: "A valid JSON body is required." }, { status: 400 });
  const roomId = String(body.roomId ?? "").trim();
  const content = String(body.content ?? "").trim();
  const kind = body.kind === "task" ? "task" : "message";
  const agent = AGENTS.find((item) => item.id === roomId);
  if (roomId !== "botroom" && !agent) return Response.json({ error: "Unknown room." }, { status: 400 });
  if (!content) return Response.json({ error: "Message cannot be empty." }, { status: 400 });
  if (content.length > 4000) return Response.json({ error: "Message is too long (maximum 4000 characters)." }, { status: 400 });
  const messages = await load(userId);
  const item: RoomMessage = {
    id: crypto.randomUUID(),
    roomId,
    kind,
    author: "owner",
    authorName: "You",
    content,
    createdAt: new Date().toISOString(),
    // This records a task for visibility; it does not claim an agent has executed it.
    status: kind === "task" ? "queued" : "recorded"
  };
  messages.push(item);
  await (redis as any).set(key(userId), messages.slice(-300));
  return Response.json({ ok: true, message: item, orchestration: "not-connected" }, { headers: { "Cache-Control": "no-store" } });
}
