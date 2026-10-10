import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { isAuthorized } from "../../auth/route";
export const runtime="nodejs";
export async function GET(req:Request){
 if(!process.env.TAROTAI_ACCESS_CODE)return NextResponse.json({error:"Private access is not configured"},{status:503});
 if(!isAuthorized(req))return NextResponse.json({error:"Authentication required"},{status:401});
 const url=process.env.UPSTASH_REDIS_REST_URL,token=process.env.UPSTASH_REDIS_REST_TOKEN;
 if(!url||!token)return NextResponse.json({error:"Signal storage not configured"},{status:503});
 try{const redis=new Redis({url,token});const rows=await redis.lrange("tarotai:tradingview:signals",0,99);return NextResponse.json({signals:rows.map((x:any)=>typeof x==="string"?JSON.parse(x):x),count:rows.length,execution:"DISABLED"});}
 catch{return NextResponse.json({error:"Could not read TradingView signal queue"},{status:503});}
}