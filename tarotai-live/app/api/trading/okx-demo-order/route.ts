import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { isAuthorized } from "../../../../lib/auth";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:Request){
 if(!process.env.TAROTAI_ACCESS_CODE)return NextResponse.json({error:"Private access is not configured"},{status:503});
 if(!isAuthorized(req))return NextResponse.json({error:"Authentication required"},{status:401});
 const key=process.env.OKX_DEMO_API_KEY,secret=process.env.OKX_DEMO_API_SECRET,passphrase=process.env.OKX_DEMO_API_PASSPHRASE;
 if(!key||!secret||!passphrase)return NextResponse.json({error:"OKX demo API key, secret and passphrase must be configured server-side"},{status:503});
 let b:any;try{b=await req.json()}catch{return NextResponse.json({error:"Expected JSON"},{status:400})}
 if(b?.confirmTestnetOrder!==true)return NextResponse.json({error:"Explicit demo-trading confirmation required"},{status:400});
 const symbol=String(b.symbol||"").toUpperCase(),side=String(b.side||"").toLowerCase(),type=String(b.type||"limit").toLowerCase(),qty=Number(b.quantity),price=Number(b.price),clientOrderId=String(b.clientOrderId||"");
 if(!/^[A-Z0-9]{4,20}$/.test(symbol)||!["buy","sell"].includes(side)||!["limit","market"].includes(type)||!Number.isFinite(qty)||qty<=0||!/^[A-Za-z0-9]{1,32}$/.test(clientOrderId)||(type==="limit"&&(!Number.isFinite(price)||price<=0)))return NextResponse.json({error:"Invalid order parameters"},{status:400});
 const instId=symbol.endsWith("USDT")?symbol.slice(0,-4)+"-USDT-SWAP":symbol;
 const body:any={instId,tdMode:"cross",side,ordType:type,sz:String(qty),clOrdId:clientOrderId};if(type==="limit")body.px=String(price);
 const bodyText=JSON.stringify(body),timestamp=new Date().toISOString(),path="/api/v5/trade/order";
 const prehash=timestamp+"POST"+path+bodyText,signature=createHmac("sha256",secret).update(prehash).digest("base64");
 try{
  const r=await fetch("https://www.okx.com"+path,{method:"POST",headers:{"Content-Type":"application/json","OK-ACCESS-KEY":key,"OK-ACCESS-SIGN":signature,"OK-ACCESS-TIMESTAMP":timestamp,"OK-ACCESS-PASSPHRASE":passphrase,"x-simulated-trading":"1"},body:bodyText,cache:"no-store",signal:AbortSignal.timeout(10000)});
  const d=await r.json(),item=Array.isArray(d?.data)?d.data[0]:null;
  if(!r.ok||d?.code!=="0"||item?.sCode!=="0"||!item?.ordId)return NextResponse.json({accepted:false,venue:"okx-demo",httpStatus:r.status,exchangeCode:item?.sCode||d?.code||null,exchangeMessage:item?.sMsg||d?.msg||"Order rejected or response unexpected",liveTradingEnabled:false},{status:502});
  return NextResponse.json({accepted:true,venue:"okx-demo",httpStatus:r.status,order:{orderId:item.ordId,clientOrderId:item.clOrdId||null,symbol:instId,side,type,quantity:String(qty),status:"ACKNOWLEDGED"},liveTradingEnabled:false,notice:"The simulated-trading header is set; no production trading mode was requested."});
 }catch{return NextResponse.json({accepted:false,error:"OKX demo order request failed; verify status before retrying",liveTradingEnabled:false},{status:502});}
}