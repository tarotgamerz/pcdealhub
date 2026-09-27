export async function GET() {
  return Response.json({ ok: true, runtime: "next-app-router", gatewayConfigured: Boolean(process.env.AI_GATEWAY_API_KEY || process.env.AI_GATEWAY_BASE_URL || process.env.VERCEL_OIDC_TOKEN), exaConfigured: Boolean(process.env.EXA_API_KEY), oidcEnabled: Boolean(process.env.VERCEL_OIDC_TOKEN) });
}
