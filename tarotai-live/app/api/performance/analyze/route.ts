import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!process.env.TAROTAI_ACCESS_CODE) return NextResponse.json({ error: "Private access is not configured." }, { status: 503 });
  if (!isAuthorized(request)) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Expected JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid telemetry." }, { status: 400 });
  const payload = JSON.stringify(body);
  if (payload.length > 60000) return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  const b = body as Record<string, any>;
  if (!b.chart || !b.execution_speeds || !["ok", "blank", "frozen", "error", "unknown"].includes(b.chart.renderer_status)) return NextResponse.json({ error: "Invalid telemetry shape." }, { status: 400 });
  const tasks: Promise<any>[] = [];
  if (process.env.GEMINI_API_KEY) tasks.push(fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(process.env.GEMINI_MODEL || "gemini-2.5-flash") + ":generateContent?key=" + encodeURIComponent(process.env.GEMINI_API_KEY), { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000), body: JSON.stringify({ systemInstruction: { parts: [{ text: "Analyze chart performance telemetry. Return JSON with detected_issues and recommendations. Do not invent measurements." }] }, contents: [{ role: "user", parts: [{ text: payload }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.2 } }) }).then(async r => { if (!r.ok) throw new Error("Gemini HTTP " + r.status); const d = await r.json(); return { provider: "gemini", result: d.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") }; }));
  if (process.env.XAI_API_KEY || process.env.OPENROUTER_API_KEY) { const direct = Boolean(process.env.XAI_API_KEY); const grokUrl = direct ? "https://api.x.ai/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions"; const grokKey = process.env.XAI_API_KEY || process.env.OPENROUTER_API_KEY; const grokModel = process.env.GROK_MODEL || (direct ? "grok-3-mini" : "x-ai/grok-3-mini"); tasks.push(fetch(grokUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + grokKey, ...(direct ? {} : { "X-Title": "TarotAI Performance Analyzer" }) }, signal: AbortSignal.timeout(15000), body: JSON.stringify({ model: grokModel, response_format: { type: "json_object" }, messages: [{ role: "system", content: "Analyze chart performance telemetry. Return JSON with detected_issues and recommendations. Do not invent measurements." }, { role: "user", content: payload }] }) }).then(async r => { if (!r.ok) throw new Error("Grok HTTP " + r.status); const d = await r.json(); return { provider: "grok", result: d.choices?.[0]?.message?.content }; })); }
  if (!tasks.length) return NextResponse.json({ error: "Set GEMINI_API_KEY and/or XAI_API_KEY or OPENROUTER_API_KEY in the server environment." }, { status: 503 });
  const settled = await Promise.allSettled(tasks);
  const analyses = settled.flatMap((x: any) => x.status === "fulfilled" ? [x.value] : []);
  const errors = settled.flatMap((x: any, i) => x.status === "rejected" ? [{ provider: i === 0 && process.env.GEMINI_API_KEY ? "gemini" : "grok", error: x.reason instanceof Error ? x.reason.message : "Provider failed" }] : []);
  if (!analyses.length) return NextResponse.json({ error: "All configured analysis providers failed.", provider_errors: errors }, { status: 502 });
  return NextResponse.json({ analyses, provider_errors: errors, automatic_changes_applied: false }, { headers: { "Cache-Control": "no-store" } });
}
