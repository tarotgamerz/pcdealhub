import { isAuthorized } from "@/lib/auth";

export async function GET(request: Request) {
  const hasAccessCode = Boolean(process.env.TAROTAI_ACCESS_CODE);
  const base = {
    ok: true,
    runtime: "next-app-router",
    securityMode: process.env.NODE_ENV === "production" ? "access-code-required" : "development",
    hasAccessCode
  };

  // Health checks are public for uptime/setup messaging; keep environment
  // capability details visible only to a verified owner session.
  if (!isAuthorized(request)) {
    return Response.json(base, { headers: { "Cache-Control": "no-store" } });
  }

  return Response.json(
    {
      ...base,
      aiTransport: "direct-openrouter",
      buildSource: process.env.VERCEL_GIT_COMMIT_REF || "unknown",
      buildCommit: process.env.VERCEL_GIT_COMMIT_SHA || null,
      oidcFeatureEnabled: true,
      hasExa: Boolean(process.env.EXA_API_KEY),
      hasComposio: Boolean(process.env.COMPOSIO_API_KEY),
      hasDurableMemory: Boolean(
        process.env.UPSTASH_REDIS_REST_URL &&
        process.env.UPSTASH_REDIS_REST_TOKEN
      ),
      hasGatewayKey: Boolean(process.env.AI_GATEWAY_API_KEY),
      hasOpenRouterKey: Boolean(process.env.OPENROUTER_API_KEY),
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      hasXaiKey: Boolean(process.env.XAI_API_KEY),
      documentExtraction: "pdf-docx-pptx-xlsx-text",
      githubWriteEnabled: Boolean(
        process.env.GITHUB_WRITE_TOKEN &&
        process.env.TAROTAI_GITHUB_WRITE_ENABLED === "true"
      ),
      model: process.env.OPENROUTER_MODEL || "openrouter/free",
      deployment: process.env.VERCEL_DEPLOYMENT_ID || null
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
