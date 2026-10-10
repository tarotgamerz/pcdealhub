import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { isAuthorized } from "../../../../lib/auth";
export const runtime="nodejs";
export async function GET(req:Request){
 if(!process.env.TAROTAI_ACCESS_CODE)return NextResponse.json({error:"Private access is not configured"},{status:503});
 if(!isAuthorized(req))return NextResponse.json({error:"Authentication required"},{status:401});
 const key=process.env.OKX_DEMO_API_KEY,secret=process.env.OKX_DEMO_API_SECRET,pass=process.env.OKX_DEMO_API_PASSPHRASE;if(!key||!secret||!pass)return NextResponse.json({error:"OKX demo credentials missing"},{status:503});
 const q=new URL(req.url).searchParams,symbol=(q.get("symbol")||"").toUpperCase(),orderId=q.get("orderId")||"";
 if(!/^[A-Z0-9-]{4,40}$/.test(symbol)||!/^[A-Za-z0-9-]{1,100}$/.test(orderId))return NextResponse.json({error:"Valid instrument and orderId required"},{status:400});
 const instId=symbol.endsWith("USDT")?symbol.slice(0,-4)+"-USDT-SWAP":symbol,path="/api/v5/trade/order?"+new URLSearchParams({instId,ordId:orderId}).toString(),timestamp=new Date().toISOString(),signature=createHmac("sha256",secret).update(timestamp+"GET"+path).digest("base64");
 try{const r=await fetch("https://www.okx.com"+path,{headers:{"OK-ACCESS-KEY":key,"OK-ACCESS-SIGN":signature,"OK-ACCESS-TIMESTAMP":timestamp,"OK-ACCESS-PASSPHRASE":pass,"x-simulated-trading":"1"},cache:"no-store",signal:AbortSignal.timeout(8000)});const d=await r.json(),item=d?.data?.[0];if(!r.ok||d?.code!=="0"||!item)return NextResponse.json({verified:false,httpStatus:r.status,exchangeCode:d?.code||null,message:d?.msg||"Order not found"},{status:502});return NextResponse.json({verified:true,venue:"okx-demo",order:{orderId:item.ordId,symbol:item.instId,side:item.side,type:item.ordType,status:item.state,quantity:item.sz,filledQuantity:item.accFillSz,averagePrice:item.avgPx},liveTradingEnabled:false});}
 catch{return NextResponse.json({verified:false,error:"OKX demo order status request failed"},{status:502});}
}