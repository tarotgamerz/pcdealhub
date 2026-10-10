import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { isAuthorized } from "../../../../lib/auth";
import { validateOrderRequest } from "../../../../lib/trading-rules.mjs";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const HOST="https://demo-fapi.binance.com";
export async function POST(req:Request){
 if(!process.env.TAROTAI_ACCESS_CODE)return NextResponse.json({error:"Private access is not configured"},{status:503});
 if(!isAuthorized(req))return NextResponse.json({error:"Authentication required"},{status:401});
 const apiKey=process.env.BINANCE_TESTNET_API_KEY,secret=process.env.BINANCE_TESTNET_API_SECRET;
 if(!apiKey||!secret)return NextResponse.json({error:"Binance demo credentials missing. Configure BINANCE_TESTNET_API_KEY and BINANCE_TESTNET_API_SECRET in server environment only."},{status:503});
 let b:any;try{b=await req.json()}catch{return NextResponse.json({error:"Expected JSON"},{status:400})}
 if(b?.confirmTestnetOrder!==true)return NextResponse.json({error:"Explicit confirmTestnetOrder:true is required"},{status:400});
 const symbol=String(b.symbol||"").toUpperCase(),side=String(b.side||"").toUpperCase(),type=String(b.type||"LIMIT").toUpperCase();
 const quantity=Number(b.quantity),price=Number(b.price),clientOrderId=String(b.clientOrderId||"");
 const validation=validateOrderRequest({symbol,side,type,quantity,price,clientOrderId,venue:"binance"});
 if(validation)return NextResponse.json({error:"Order rejected by local validation",reason:validation},{status:400});
 const params=new URLSearchParams({symbol,side,type,quantity:String(quantity),timestamp:String(Date.now()),recvWindow:"5000",newOrderRespType:"RESULT",newClientOrderId:clientOrderId});
 if(type==="LIMIT"){params.set("price",String(price));params.set("timeInForce",String(b.timeInForce||"GTC"));}
 const signature=createHmac("sha256",secret).update(params.toString()).digest("hex");params.set("signature",signature);
 try{
  const response=await fetch(HOST+"/fapi/v1/order",{method:"POST",headers:{"X-MBX-APIKEY":apiKey,"Content-Type":"application/x-www-form-urlencoded"},body:params.toString(),cache:"no-store",signal:AbortSignal.timeout(10000)});
  const data=await response.json();
  if(!response.ok||data?.orderId==null)return NextResponse.json({accepted:false,venue:"binance-usdm-demo",httpStatus:response.status,exchangeCode:data?.code??null,exchangeMessage:data?.msg||"Order rejected or response schema unexpected",liveTradingEnabled:false},{status:502});
  return NextResponse.json({accepted:true,venue:"binance-usdm-demo",httpStatus:response.status,order:{orderId:data.orderId,clientOrderId:data.clientOrderId,symbol:data.symbol,side:data.side,type:data.type,status:data.status,origQty:data.origQty,executedQty:data.executedQty,avgPrice:data.avgPrice,updateTime:data.updateTime},liveTradingEnabled:false,notice:"Order was sent only to the hard-coded Binance demo/testnet host."},{status:200});
 }catch{return NextResponse.json({accepted:false,error:"Binance demo order request timed out or network failed; verify order status before retrying to avoid duplicate submissions.",liveTradingEnabled:false},{status:502});}
}