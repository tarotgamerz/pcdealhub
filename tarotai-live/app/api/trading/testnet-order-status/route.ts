import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { isAuthorized } from "../../../../lib/auth";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:Request){
 if(!process.env.TAROTAI_ACCESS_CODE)return NextResponse.json({error:"Private access is not configured"},{status:503});
 if(!isAuthorized(req))return NextResponse.json({error:"Authentication required"},{status:401});
 const apiKey=process.env.BINANCE_TESTNET_API_KEY,secret=process.env.BINANCE_TESTNET_API_SECRET;
 if(!apiKey||!secret)return NextResponse.json({error:"Binance demo credentials missing from server environment"},{status:503});
 const q=new URL(req.url).searchParams,symbol=(q.get("symbol")||"").toUpperCase(),orderId=q.get("orderId")||"";
 if(!/^[A-Z0-9]{4,20}$/.test(symbol)||!/^[0-9]{1,30}$/.test(orderId))return NextResponse.json({error:"Valid symbol and numeric orderId are required"},{status:400});
 const params=new URLSearchParams({symbol,orderId,timestamp:String(Date.now()),recvWindow:"5000"});
 params.set("signature",createHmac("sha256",secret).update(params.toString()).digest("hex"));
 try{
  const r=await fetch("https://demo-fapi.binance.com/fapi/v1/order?"+params.toString(),{headers:{"X-MBX-APIKEY":apiKey},cache:"no-store",signal:AbortSignal.timeout(8000)});
  const d=await r.json();
  if(!r.ok||d?.orderId==null)return NextResponse.json({verified:false,httpStatus:r.status,exchangeCode:d?.code??null,message:d?.msg||"Order not found or unexpected response",liveTradingEnabled:false},{status:502});
  return NextResponse.json({verified:true,venue:"binance-usdm-demo",order:{orderId:d.orderId,symbol:d.symbol,side:d.side,type:d.type,status:d.status,origQty:d.origQty,executedQty:d.executedQty,avgPrice:d.avgPrice,updateTime:d.updateTime},liveTradingEnabled:false});
 }catch{return NextResponse.json({verified:false,error:"Order status request failed; check the demo exchange directly before retrying"},{status:502});}
}