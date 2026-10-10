import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { isAuthorized } from "../../../../lib/auth";
export const runtime="nodejs";
export async function GET(req:Request){
 if(!process.env.TAROTAI_ACCESS_CODE)return NextResponse.json({error:"Private access is not configured"},{status:503});
 if(!isAuthorized(req))return NextResponse.json({error:"Authentication required"},{status:401});
 const key=process.env.BYBIT_TESTNET_API_KEY,secret=process.env.BYBIT_TESTNET_API_SECRET;if(!key||!secret)return NextResponse.json({error:"Bybit testnet credentials missing"},{status:503});
 const q=new URL(req.url).searchParams,symbol=(q.get("symbol")||"").toUpperCase(),orderId=q.get("orderId")||"";
 if(!/^[A-Z0-9]{4,20}$/.test(symbol)||!/^[A-Za-z0-9-]{1,100}$/.test(orderId))return NextResponse.json({error:"Valid symbol and orderId required"},{status:400});
 const queryParams=new URLSearchParams({category:"linear",symbol});if(/^[0-9]{1,40}$/.test(orderId))queryParams.set("orderId",orderId);else queryParams.set("orderLinkId",orderId);const query=queryParams.toString(),timestamp=String(Date.now()),window="5000",signature=createHmac("sha256",secret).update(timestamp+key+window+query).digest("hex");
 try{const r=await fetch("https://api-testnet.bybit.com/v5/order/realtime?"+query,{headers:{"X-BAPI-API-KEY":key,"X-BAPI-SIGN":signature,"X-BAPI-TIMESTAMP":timestamp,"X-BAPI-RECV-WINDOW":window},cache:"no-store",signal:AbortSignal.timeout(8000)});const d=await r.json(),item=d?.result?.list?.[0];if(!r.ok||d?.retCode!==0||!item)return NextResponse.json({verified:false,httpStatus:r.status,exchangeCode:d?.retCode??null,message:d?.retMsg||"Order not found"},{status:502});return NextResponse.json({verified:true,venue:"bybit-testnet",order:{orderId:item.orderId,symbol:item.symbol,side:item.side,type:item.orderType,status:item.orderStatus,qty:item.qty,cumExecQty:item.cumExecQty,avgPrice:item.avgPrice},liveTradingEnabled:false});}
 catch{return NextResponse.json({verified:false,error:"Bybit order status request failed"},{status:502});}
}