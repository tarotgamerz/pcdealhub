import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { isAuthorized } from "../../../../lib/auth";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:Request){
 if(!process.env.TAROTAI_ACCESS_CODE)return NextResponse.json({error:"Private access is not configured"},{status:503});
 if(!isAuthorized(req))return NextResponse.json({error:"Authentication required"},{status:401});
 const apiKey=process.env.BYBIT_TESTNET_API_KEY,secret=process.env.BYBIT_TESTNET_API_SECRET;
 if(!apiKey||!secret)return NextResponse.json({error:"Bybit testnet credentials must be configured server-side"},{status:503});
 let b:any;try{b=await req.json()}catch{return NextResponse.json({error:"Expected JSON"},{status:400})}
 if(b?.confirmTestnetOrder!==true)return NextResponse.json({error:"Explicit testnet confirmation required"},{status:400});
 const symbol=String(b.symbol||"").toUpperCase(),side=String(b.side||"").toUpperCase(),type=String(b.type||"Limit").toLowerCase(),qty=Number(b.quantity),price=Number(b.price);
 if(!/^[A-Z0-9]{4,20}$/.test(symbol)||!["BUY","SELL"].includes(side)||!["limit","market"].includes(type)||!Number.isFinite(qty)||qty<=0||(type==="limit"&&(!Number.isFinite(price)||price<=0)))return NextResponse.json({error:"Invalid order parameters"},{status:400});
 const body:any={category:"linear",symbol,side:side==="BUY"?"Buy":"Sell",orderType:type==="limit"?"Limit":"Market",qty:String(qty)};
 if(type==="limit"){body.price=String(price);body.timeInForce=String(b.timeInForce||"GTC");}
 const bodyText=JSON.stringify(body),timestamp=String(Date.now()),recvWindow="5000",signature=createHmac("sha256",secret).update(timestamp+apiKey+recvWindow+bodyText).digest("hex");
 try{
  const r=await fetch("https://api-testnet.bybit.com/v5/order/create",{method:"POST",headers:{"Content-Type":"application/json","X-BAPI-API-KEY":apiKey,"X-BAPI-SIGN":signature,"X-BAPI-TIMESTAMP":timestamp,"X-BAPI-RECV-WINDOW":recvWindow},body:bodyText,cache:"no-store",signal:AbortSignal.timeout(10000)});
  const d=await r.json();
  if(!r.ok||d?.retCode!==0||!d?.result?.orderId)return NextResponse.json({accepted:false,venue:"bybit-testnet",httpStatus:r.status,exchangeCode:d?.retCode??null,exchangeMessage:d?.retMsg||"Order rejected or response unexpected",liveTradingEnabled:false},{status:502});
  return NextResponse.json({accepted:true,venue:"bybit-testnet",httpStatus:r.status,order:{orderId:d.result.orderId,orderLinkId:d.result.orderLinkId||null,symbol,side:body.side,type:body.orderType,quantity:body.qty,status:"ACKNOWLEDGED"},liveTradingEnabled:false});
 }catch{return NextResponse.json({accepted:false,error:"Bybit testnet request failed; verify order status before retrying",liveTradingEnabled:false},{status:502});}
}