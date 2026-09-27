export const runtime = "nodejs";
export const maxDuration = 120;

const system = `You are tarotai, a private operator-grade AI assistant.
Use the objective → plan → execute → observe → adapt → verify → complete mindset.
Be direct, friendly, and practical. Remember the owner's working context when supplied by the application.
Never claim an external action succeeded without evidence.
When you lack a tool or permission, say so clearly and give the exact next action.`;

function normalizeMessages(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((m: any) => m && ["user", "assistant", "system"].includes(m.role))
    .map((m: any) => ({ role: m.role, content: String(m.content ?? "") }))
    .filter((m: any) => m.content.length > 0)
    .slice(-40);
}

function extractError(raw: string) {
  try {
    const data = JSON.parse(raw);
    return data?.error?.message || data?.error || data?.message || raw;
  } catch {
    return raw;
  }
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return Response.json(
        {
          error:
            "OPENROUTER_API_KEY is not configured. Add an OpenRouter API key to the Vercel Production environment, then redeploy.",
          setup:
            "OpenRouter offers free models and does not require a subscription or credit card to start."
        },
        { status: 503 }
      );
    }

    const body: any = await request.json().catch(() => ({}));
    const messages = normalizeMessages(body?.messages);
    if (!messages.length) {
      return Response.json({ error: "messages is required" }, { status: 400 });
    }

    const model = process.env.OPENROUTER_MODEL || "openrouter/free";
    const memory = Array.isArray(body?.memory) ? body.memory.slice(0, 30) : [];
    const memoryText = memory.length
      ? \`\\nKnown owner memory:\\n${memory.map((m: any) => \`- ${m.key}: ${m.value}\`).join("\\n")}\`
      : "";

    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: \`Bearer ${apiKey}\`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://tarotai-core.vercel.app",
        "X-Title": "tarotai"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system + memoryText },
          ...messages.filter((m: any) => m.role !== "system")
        ],
        max_tokens: 4096
      }),
      cache: "no-store"
    });

    const raw = await upstream.text();
    if (!upstream.ok) {
      const detail = extractError(raw);
      console.error("OpenRouter upstream error", upstream.status, detail);
      return Response.json(
        {
          error: \`OpenRouter request failed (${upstream.status}): ${detail}\`
        },
        { status: 502 }
      );
    }

    const data = JSON.parse(raw);
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string") {
      return Response.json(
        { error: "OpenRouter returned no assistant text.", raw: data },
        { status: 502 }
      );
    }

    return Response.json({
      text,
      toolEvents: [],
      finishReason: data?.choices?.[0]?.finish_reason || null,
      usage: data?.usage || null,
      model: data?.model || model
    });
  } catch (error) {
    console.error("tarotai chat error", error);
    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error && error.cause ? String(error.cause) : null;
    return Response.json(
      { error: cause ? \`${message} | cause: ${cause}\` : message },
      { status: 500 }
    );
  }
}
