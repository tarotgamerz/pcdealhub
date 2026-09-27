export const runtime = "nodejs";
export const maxDuration = 90;

function authorized(request: Request) {
  const configured = Boolean(process.env.TAROTAI_ACCESS_CODE);
  const session = request.headers
    .get("cookie")
    ?.split(";")
    .some((v) => v.trim() === "tarotai_session=authorized");
  return !configured || Boolean(session);
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
    if (!authorized(request)) return Response.json({ error: "Authentication required." }, { status: 401 });
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return Response.json({ error: "OPENROUTER_API_KEY is not configured." }, { status: 503 });

    const form = await request.formData();
    const item = form.get("file");
    const prompt = String(form.get("prompt") || "Describe and analyze this image in detail. Read visible text when possible.");
    if (!(item instanceof File)) return Response.json({ error: "Attach an image using the 'file' field." }, { status: 400 });
    if (!String(item.type).startsWith("image/")) return Response.json({ error: "Only image files are supported by this vision endpoint." }, { status: 415 });
    if (item.size > 8 * 1024 * 1024) return Response.json({ error: "Image is too large. Maximum size is 8 MB." }, { status: 413 });

    const bytes = Buffer.from(await item.arrayBuffer());
    const dataUrl = "data:" + item.type + ";base64," + bytes.toString("base64");
    const model = process.env.OPENROUTER_VISION_MODEL || "inclusionai/ling-3.0-flash-vl:free";

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://tarotai-core.vercel.app",
        "X-Title": "tarotai vision"
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt.slice(0, 4000) },
            { type: "image_url", image_url: { url: dataUrl } }
          ]
        }],
        max_tokens: 4096
      }),
      cache: "no-store"
    });

    const raw = await response.text();
    if (!response.ok) return Response.json({ error: "Vision model failed (" + response.status + "): " + extractError(raw) }, { status: 502 });
    const data = JSON.parse(raw);
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string") return Response.json({ error: "Vision model returned no text." }, { status: 502 });

    return Response.json({ ok: true, name: item.name, model: data?.model || model, text }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: "Vision processing failed: " + (error instanceof Error ? error.message : String(error)) }, { status: 500 });
  }
}
