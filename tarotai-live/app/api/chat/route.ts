import { createGatewayProvider } from "@ai-sdk/gateway";
import { generateText } from "ai";

export const maxDuration = 120;

const gateway = createGatewayProvider({ baseURL: process.env.AI_GATEWAY_BASE_URL });

const system = `You are tarotai, a private operator-grade AI assistant.
Use the objective → plan → execute → observe → adapt → verify → complete mindset.
Be direct, friendly, and practical. Remember the owner's working context when supplied by the application. Never claim an external action succeeded without evidence.`;

function normalizeMessages(input: unknown){
  if(!Array.isArray(input)) return [];
  return input.filter((m:any)=>m && ["user","assistant","system"].includes(m.role))
    .map((m:any)=>({role:m.role,content:String(m.content??"")}))
    .filter((m:any)=>m.content.length>0).slice(-40);
}

export async function POST(request: Request){
  try{
    const body:any = await request.json().catch(()=>({}));
    const messages = normalizeMessages(body?.messages);
    if(!messages.length) return Response.json({error:"messages is required"},{status:400});

    const modelId = process.env.TAROTAI_MODEL || "openai/gpt-5.5";
    const memory = Array.isArray(body?.memory) ? body.memory.slice(0,30) : [];
    const memoryText = memory.length ? `\\nKnown owner memory:\\n${memory.map((m:any)=>`- ${m.key}: ${m.value}`).join("\\n")}` : "";

    const result = await generateText({
      model: gateway(modelId),
      system: system + memoryText,
      messages: messages as any,
      maxOutputTokens: 4096
    });

    return Response.json({text:result.text,toolEvents:[],finishReason:result.finishReason||null,usage:result.usage||null});
  }catch(error){
    console.error("tarotai chat error",error);
    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error && error.cause ? String(error.cause) : null;
    return Response.json({error:cause?`${message} | cause: ${cause}`:message},{status:500});
  }
}
