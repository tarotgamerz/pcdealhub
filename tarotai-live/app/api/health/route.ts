export async function GET() {
  return Response.json(
    {
      ok: true,
      runtime: "next-app-router",
      aiTransport: "direct-openrouter",
      buildSource: "github-main",
      oidcFeatureEnabled: true,
      hasExa: Boolean(process.env.EXA_API_KEY),
      hasGatewayKey: Boolean(process.env.AI_GATEWAY_API_KEY),
      hasOpenRouterKey: Boolean(process.env.OPENROUTER_API_KEY),
      hasAccessCode: Boolean(process.env.TAROTAI_ACCESS_CODE),
      securityMode: process.env.NODE_ENV === "production" ? "access-code-required" : "development",
      model: process.env.OPENROUTER_MODEL || "openrouter/free",
      deployment: process.env.VERCEL_DEPLOYMENT_ID || null
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
