export async function GET(){
  return Response.json({ok:true,runtime:"next-app-router",oidcFeatureEnabled:true,hasExa:Boolean(process.env.EXA_API_KEY),hasGatewayKey:Boolean(process.env.AI_GATEWAY_API_KEY),deployment:process.env.VERCEL_DEPLOYMENT_ID||null});
}
