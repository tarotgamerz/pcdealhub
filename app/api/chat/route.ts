import { createGatewayProvider } from "@ai-sdk/gateway";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

export const maxDuration = 120;

const ownerContext = `Owner working context:
- Communication: direct, friendly, simple WhatsApp-style explanations; proactive execution; avoid repeated questions when context is already known.
- Study: CA/CMA/B.Com Hons with Economics; practical examples help.
- PC: Windows 11 Home; Intel i5-3350P; RX 580 2048SP; 8 GB DDR3; Zebronics H61/LGA1155; 120+256 GB SSD; 500 W PSU; recurring troubleshooting around CPU clocks, restarts, Secure Boot/TPM, drivers, gaming.
- PCDealHub: Indian PC-hardware deal/affiliate project in tarotgamerz/pcdealhub with validation/freshness/RSS automation and affiliate setup.
- tarotai goal: private operator AI that can answer, research, plan, execute authorized actions, observe, adapt, verify, and retain useful non-sensitive context.
`;

function cleanMessages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((m: any) => m && (m.role === "user" || m.role === "assistant" || m.role === "system"))
    .map((m: any) => ({ role: m.role, content: String(m.content ?? "") }))
    .filter((m) => m.content.length > 0)
    .slice(-40);
}

export async function POST(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  if (process.env.TAROTAI_ACCESS_CODE && !cookie.split(";").some((v) => v.trim() === "tarotai_session=authorized")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const messages = cleanMessages(body?.messages);
    const memory = Array.isArray(body?.memory) ? body.memory.slice(0, 30) : [];
    if (!messages.length) return Response.json({ error: "messages is required" }, { status: 400 });

    const modelId = process.env.TAROTAI_MODEL || "openai/gpt-5.5";
    const gateway = createGatewayProvider({ baseURL: process.env.AI_GATEWAY_BASE_URL });

    const planTool = tool({
      description: "Create a concrete execution plan for a substantial user task.",
      inputSchema: z.object({ goal: z.string(), steps: z.array(z.string()).min(2).max(12), successCriteria: z.array(z.string()).min(1).max(8) }),
      execute: async (input) => ({ type: "plan", ...input })
    });

    const webSearchTool = tool({
      description: "Search the live public web for current or unfamiliar information.",
      inputSchema: z.object({ query: z.string().min(2), recencyDays: z.number().int().min(0).max(3650).optional() }),
      execute: async ({ query, recencyDays }) => {
        const key = process.env.EXA_API_KEY;
        if (!key) return { type: "web_search", status: "unavailable", message: "Live web search is not configured." };
        const payload: any = { query, numResults: 6, contents: { text: { maxCharacters: 3500 } } };
        if (recencyDays && recencyDays > 0) payload.startPublishedDate = new Date(Date.now() - recencyDays * 86400000).toISOString();
        const r = await fetch("https://api.exa.ai/search", { method: "POST", headers: { Authorization: \`Bearer \${key}\`, "Content-Type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" });
        if (!r.ok) return { type: "web_search", status: "error", message: \`Search provider HTTP \${r.status}\` };
        const d = await r.json();
        return { type: "web_search", status: "ok", results: (d.results || []).map((x: any) => ({ title: x.title, url: x.url, snippet: String(x.text || "").slice(0, 1200), publishedDate: x.publishedDate || null })) };
      }
    });

    const readWebpageTool = tool({
      description: "Read a known public webpage URL and return visible text.",
      inputSchema: z.object({ url: z.string().url() }),
      execute: async ({ url }) => {
        const r = await fetch(url, { headers: { "User-Agent": "tarotai/1.0" }, cache: "no-store" });
        if (!r.ok) return { type: "read_webpage", status: "error", url, message: \`HTTP \${r.status}\` };
        const html = await r.text();
        const text = html.replace(/<script[\\s\\S]*?<\\/script>/gi, " ").replace(/<style[\\s\\S]*?<\\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim();
        return { type: "read_webpage", status: "ok", url, text: text.slice(0, 14000) };
      }
    });

    const executeTaskTool = tool({
      description: "Execute an explicitly authorized action through the configured tarotai executor.",
      inputSchema: z.object({ capability: z.enum(["browser","filesystem","terminal","application","api"]), action: z.string().min(1), arguments: z.record(z.unknown()).default({}), permission: z.string().min(1) }),
      execute: async ({ capability, action, arguments: args, permission }) => {
        const allowed = new Set((process.env.TAROTAI_AUTONOMOUS_PERMISSIONS || "").split(",").map((v) => v.trim()).filter(Boolean));
        if (!allowed.has(permission)) return { type: "permission", status: "needs_attention", permission, capability, action, message: \`Permission '${permission}' is not enabled.\` };
        const endpoint = process.env.TAROTAI_TOOL_EXECUTOR_URL;
        if (!endpoint) return { type: "executor", status: "unavailable", message: "No authorized task executor is connected." };
        const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", ...(process.env.TAROTAI_TOOL_EXECUTOR_TOKEN ? { Authorization: \`Bearer \${process.env.TAROTAI_TOOL_EXECUTOR_TOKEN}\` } : {}) }, body: JSON.stringify({ capability, action, arguments: args }), cache: "no-store" });
        const data = await r.json().catch(() => ({ message: "Executor returned non-JSON output." }));
        return { type: "executor", status: r.ok ? "ok" : "error", capability, action, payload: data };
      }
    });

    const verifyTool = tool({
      description: "Perform an explicit verification checkpoint before claiming a task is complete.",
      inputSchema: z.object({ target: z.string(), checks: z.array(z.string()).min(1).max(8), outcome: z.enum(["passed","partial","failed"]), notes: z.string() }),
      execute: async (input) => ({ type: "verification", ...input })
    });

    const memoryText = memory.length ? \`\\nKnown owner memory:\\n\${memory.map((m: any) => \`- \${m.key}: \${m.value}\`).join("\\n")}\` : "";
    const result = await generateText({
      model: gateway(modelId),
      system: ownerContext + \`You are tarotai, a private operator-grade AI agent. Follow: Understand objective → Plan → Execute → Observe → Adapt → Verify → Complete. For substantial tasks, plan first. Use tools instead of merely describing work. Never claim success without evidence. Finish with Completed, Failed, Needs Attention.\` + memoryText,
      messages: messages as any,
      tools: { set_task_plan: planTool, web_search: webSearchTool, read_webpage: readWebpageTool, execute_task: executeTaskTool, verify_result: verifyTool },
      stopWhen: stepCountIs(10),
      maxOutputTokens: 6000,
    });

    const steps: any[] = Array.isArray(result.steps) ? result.steps : [];
    const toolEvents = steps.flatMap((step: any) => {
      const calls = Array.isArray(step.toolCalls) ? step.toolCalls : [];
      const outputs = Array.isArray(step.toolResults) ? step.toolResults : [];
      return calls.map((call: any, index: number) => ({ name: call.toolName, input: call.input, output: outputs[index]?.output ?? null }));
    });
    return Response.json({ text: result.text, toolEvents, finishReason: result.finishReason || null, usage: result.usage || null });
  } catch (error) {
    console.error("tarotai chat error", error);
    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error && error.cause ? String(error.cause) : null;
    return Response.json({ error: cause ? \`${message} | cause: ${cause}\` : message }, { status: 500 });
  }
}
