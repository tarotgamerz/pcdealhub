import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { isAuthorized } from "../../../../lib/auth";
import { applySlippage, calculateFee, isStale, validateStops, resolveStopTarget } from "../../../../lib/trading-rules.mjs";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function store(){const url=process.env.UPSTASH_REDIS_REST_URL,token=process.env.UPSTASH_REDIS_REST_TOKEN;if(!url||!token)throw new Error("STORE_OFF");return new Redis({url,token});}
export async function GET(req:Request){
 if(!process.env.TAROTAI_ACCESS_CODE)return NextResponse.json({error:"Private access is not configured"},{status:503});
 if(!isAuthorized(req))return NextResponse.json({error:"Authentication required"},{status:401});
 try{const d=store();const [ledger,replays]=await Promise.all([d.lrange("tarotai:paper:ledger",0,199),d.lrange("tarotai:paper:replays",0,19)]);return NextResponse.json({mode:"PAPER_ONLY",liveTradingEnabled:false,ledger:ledger.map((x:any)=>typeof x==="string"?JSON.parse(x):x),replays:replays.map((x:any)=>typeof x==="string"?JSON.parse(x):x)});}
 catch{return NextResponse.json({error:"Persistent store unavailable; configure Upstash Redis"},{status:503});}
}
export async function POST(req:Request){
 if(!process.env.TAROTAI_ACCESS_CODE)return NextResponse.json({error:"Private access is not configured"},{status:503});
 if(!isAuthorized(req))return NextResponse.json({error:"Authentication required"},{status:401});
 let b:any;try{b=await req.json()}catch{return NextResponse.json({error:"Expected JSON"},{status:400});}
 const action=String(b.action||"").toUpperCase();
 try{
  const d=store();
  if(action==="REPLAY"){
   const symbol=String(b.symbol||"BTCUSDT").toUpperCase(),interval=String(b.interval||"1m"),limit=Math.min(500,Math.max(20,Math.floor(Number(b.limit)||100)));
   if(!/^[A-Z0-9]{4,20}$/.test(symbol)||!["1m","3m","5m","15m","30m","1h","2h","4h","1d"].includes(interval))return NextResponse.json({error:"Invalid symbol or interval"},{status:400});
   const u=new URL("https://fapi.binance.com/fapi/v1/klines");u.searchParams.set("symbol",symbol);u.searchParams.set("interval",interval);u.searchParams.set("limit",String(limit));
   const r=await fetch(u,{cache:"no-store",signal:AbortSignal.timeout(8000)}),raw=await r.json();
   if(!r.ok||!Array.isArray(raw)||!raw.length)return NextResponse.json({error:"Market replay request failed",detail:raw?.msg||"No candles"},{status:502});
   const candles=raw.map((k:any[])=>({time:+k[0],open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5],closeTime:+k[6]}));
   if(candles.some((c:any)=>![c.time,c.open,c.high,c.low,c.close,c.volume,c.closeTime].every(Number.isFinite)||c.high<c.low||c.close<=0))return NextResponse.json({error:"Malformed candles rejected"},{status:502});
   const replay={id:crypto.randomUUID(),createdAt:new Date().toISOString(),symbol,interval,candleCount:candles.length,candles};
   await d.lpush("tarotai:paper:replays",JSON.stringify(replay));await d.ltrim("tarotai:paper:replays",0,19);
   return NextResponse.json({mode:"PAPER_ONLY",replayId:replay.id,candles,stored:true,liveTradingEnabled:false});
  }
  if(action==="TICK_CHECK"){
   const symbol=String(b.symbol||"BTCUSDT").toUpperCase();
   if(!/^[A-Z0-9]{4,20}$/.test(symbol))return NextResponse.json({error:"Unsupported symbol"},{status:400});
   const lockKey="tarotai:paper:ticklock:"+symbol,lockToken=crypto.randomUUID();
   const acquired=await d.set(lockKey,lockToken,{nx:true,ex:5});
   if(!acquired)return NextResponse.json({mode:"PAPER_ONLY",checkedSymbol:symbol,triggered:[],lockBusy:true,liveTradingEnabled:false});
   try{
    let livePrice:number;
    try{
     const url=new URL("https://fapi.binance.com/fapi/v1/ticker/price");url.searchParams.set("symbol",symbol);
     const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(2500)}),raw=await response.json();
     livePrice=Number(raw?.price);
     if(!response.ok||String(raw?.symbol||"").toUpperCase()!==symbol||!Number.isFinite(livePrice)||livePrice<=0)throw new Error("ticker unavailable");
    }catch{return NextResponse.json({error:"Binance Futures live price could not be verified; tick exit was not applied"},{status:502});}
    const rows=(await d.lrange("tarotai:paper:ledger",0,999)).map((x:any)=>typeof x==="string"?JSON.parse(x):x);
    const closed=new Set(rows.filter((x:any)=>x.parentTradeId&&["PAPER_CLOSE","PAPER_STOP","PAPER_TARGET"].includes(x.status)).map((x:any)=>x.parentTradeId));
    const triggered:any[]=[];
    for(const trade of rows.filter((x:any)=>x.status==="PAPER_OPEN"&&x.symbol===symbol&&!closed.has(x.id))){
     const stop=Number(trade.stopPrice),target=Number(trade.targetPrice),qty=Number(trade.quantity),entry=Number(trade.fillPrice);
     if(![stop,target,qty,entry].every(Number.isFinite)||stop<=0||target<=0||qty<=0)continue;
     const isLong=trade.side==="BUY",stopHit=isLong?livePrice<=stop:livePrice>=stop,targetHit=isLong?livePrice>=target:livePrice<=target;
     if(!stopHit&&!targetHit)continue;
     const kind=stopHit?"STOP":"TARGET",requestedPrice=stopHit?livePrice:target,closeSide=isLong?"SELL":"BUY",feeBps=Number(trade.feeBps??5),slipBps=Number(trade.slippageBps??2);
     const fill=applySlippage(closeSide,requestedPrice,slipBps),fee=calculateFee(fill,qty,feeBps);
     const gross=isLong?(fill-entry)*qty:(entry-fill)*qty;
     const closedTrade={id:crypto.randomUUID(),parentTradeId:trade.id,createdAt:new Date().toISOString(),symbol,side:closeSide,quantity:qty,requestedPrice,liveTickPrice:livePrice,fillPrice:Number(fill.toFixed(8)),fee:Number(fee.toFixed(8)),pnlGross:Number(gross.toFixed(8)),pnlNet:Number((gross-fee-Number(trade.fee||0)).toFixed(8)),feeBps,slippageBps:slipBps,status:kind==="STOP"?"PAPER_STOP":"PAPER_TARGET",exitTrigger:"BINANCE_FUTURES_LAST_TRADE",exitTriggerAt:new Date().toISOString(),mode:"PAPER_ONLY",decisionSource:trade.decisionSource,signalCandleTime:trade.signalCandleTime,decisionAction:trade.decisionAction,agentTeamModel:trade.agentTeamModel,agentVotes:trade.agentVotes};
     await d.lpush("tarotai:paper:ledger",JSON.stringify(closedTrade));triggered.push(closedTrade);closed.add(trade.id);
    }
    await d.ltrim("tarotai:paper:ledger",0,999);
    return NextResponse.json({mode:"PAPER_ONLY",checkedSymbol:symbol,verifiedLastTradePrice:livePrice,checkedAt:new Date().toISOString(),triggered,liveTradingEnabled:false,note:"Stop/target exits are checked against a server-verified Binance Futures last-trade quote. Modeled slippage and fees apply; no real exchange order is sent."});
   }finally{
    try{await d.eval<number>("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",[lockKey],[lockToken]);}catch{}
   }
  }
  if(action==="STOP_CHECK"){
   const symbol=String(b.symbol||"BTCUSDT").toUpperCase(),venue=String(b.venue||"binance").toLowerCase();
   if(!/^[A-Z0-9]{4,20}$/.test(symbol)||!["binance","bybit","okx"].includes(venue))return NextResponse.json({error:"Unsupported symbol or venue"},{status:400});
   let url:URL,raw:any,closedCandles:any[]=[];
   try{
    if(venue==="binance"){
     url=new URL("https://fapi.binance.com/fapi/v1/klines");url.searchParams.set("symbol",symbol);url.searchParams.set("interval","1m");url.searchParams.set("limit","500");
     const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(6000)});raw=await response.json();if(!response.ok||!Array.isArray(raw))throw new Error("exchange response invalid");
     closedCandles=raw.filter((k:any[])=>Array.isArray(k)&&Number(k[6])<Date.now()-500).map((k:any[])=>({time:Number(k[0]),closeTime:Number(k[6]),candle:{open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4])}})).filter((x:any)=>[x.time,x.closeTime,x.candle.open,x.candle.high,x.candle.low,x.candle.close].every(Number.isFinite)&&x.time>0&&x.closeTime>x.time&&x.candle.low>0&&x.candle.high>=Math.max(x.candle.open,x.candle.low,x.candle.close)&&x.candle.low<=Math.min(x.candle.open,x.candle.high,x.candle.close)).sort((a:any,b:any)=>a.time-b.time);
    }else if(venue==="bybit"){
     url=new URL("https://api-testnet.bybit.com/v5/market/kline");url.searchParams.set("category","linear");url.searchParams.set("symbol",symbol);url.searchParams.set("interval","1");url.searchParams.set("limit","500");
     const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(6000)});raw=await response.json();if(!response.ok||raw?.retCode!==0||!Array.isArray(raw?.result?.list))throw new Error("exchange response invalid");
     closedCandles=raw.result.list.filter((k:any[])=>Number(k[0])+60000<Date.now()-500).map((k:any[])=>({time:Number(k[0]),closeTime:Number(k[0])+60000,candle:{open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4])}})).filter((x:any)=>[x.time,x.closeTime,x.candle.open,x.candle.high,x.candle.low,x.candle.close].every(Number.isFinite)&&x.time>0&&x.candle.low>0&&x.candle.high>=Math.max(x.candle.open,x.candle.low,x.candle.close)&&x.candle.low<=Math.min(x.candle.open,x.candle.high,x.candle.close)).sort((a:any,b:any)=>a.time-b.time);
    }else{
     const instId=symbol.endsWith("USDT")?symbol.slice(0,-4)+"-USDT-SWAP":symbol;
     url=new URL("https://www.okx.com/api/v5/market/candles");url.searchParams.set("instId",instId);url.searchParams.set("bar","1m");url.searchParams.set("limit","500");
     const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(6000)});raw=await response.json();if(!response.ok||raw?.code!=="0"||!Array.isArray(raw?.data))throw new Error("exchange response invalid");
     closedCandles=raw.data.filter((k:any[])=>k[8]==="1"&&Number(k[0])+60000<Date.now()-500).map((k:any[])=>({time:Number(k[0]),closeTime:Number(k[0])+60000,candle:{open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4])}})).filter((x:any)=>[x.time,x.closeTime,x.candle.open,x.candle.high,x.candle.low,x.candle.close].every(Number.isFinite)&&x.time>0&&x.candle.low>0&&x.candle.high>=Math.max(x.candle.open,x.candle.low,x.candle.close)&&x.candle.low<=Math.min(x.candle.open,x.candle.high,x.candle.close)).sort((a:any,b:any)=>a.time-b.time);
    }
   }catch{return NextResponse.json({error:"Could not fetch closed candles for paper stop evaluation"},{status:502});}
   if(!closedCandles.length)return NextResponse.json({error:"Exchange returned no fully closed valid candle"},{status:502});
   const latest=closedCandles[closedCandles.length-1];
   if(Date.now()-latest.closeTime>120000||latest.closeTime>Date.now())return NextResponse.json({error:"Closed stop-check candles are stale or malformed"},{status:409});
   const rows=(await d.lrange("tarotai:paper:ledger",0,999)).map((x:any)=>typeof x==="string"?JSON.parse(x):x);
   const closed=new Set(rows.filter((x:any)=>x.parentTradeId&&["PAPER_CLOSE","PAPER_STOP","PAPER_TARGET"].includes(x.status)).map((x:any)=>x.parentTradeId));
   const triggered:any[]=[],historyGaps:any[]=[];
   for(const trade of rows.filter((x:any)=>x.status==="PAPER_OPEN"&&x.symbol===symbol&&!closed.has(x.id)&&x.stopPrice&&x.targetPrice)){
    const openedAt=Date.parse(trade.createdAt);
    if(!Number.isFinite(openedAt))continue;
    if(openedAt<closedCandles[0].time){historyGaps.push({tradeId:trade.id,createdAt:trade.createdAt,oldestAvailableCandleTime:closedCandles[0].time});continue;}
    // Replay each fully closed candle after entry, in chronological order, so a temporary stop touch cannot be missed.
    const eligible=closedCandles.filter((bar:any)=>bar.time>openedAt);
    for(const bar of eligible){
     const result=resolveStopTarget(bar.candle,trade.side==="BUY"?"LONG":"SHORT",Number(trade.stopPrice),Number(trade.targetPrice));
     if(!result.exit||result.price===null)continue;
     const closeSide=trade.side==="BUY"?"SELL":"BUY",fill=applySlippage(closeSide,Number(result.price),Number(trade.slippageBps)),fee=calculateFee(fill,Number(trade.quantity),Number(trade.feeBps));
     const gross=trade.side==="BUY"?(fill-Number(trade.fillPrice))*Number(trade.quantity):(Number(trade.fillPrice)-fill)*Number(trade.quantity);
     const closedTrade={id:crypto.randomUUID(),parentTradeId:trade.id,createdAt:new Date().toISOString(),symbol,side:closeSide,quantity:trade.quantity,requestedPrice:result.price,fillPrice:Number(fill.toFixed(8)),fee:Number(fee.toFixed(8)),pnlGross:Number(gross.toFixed(8)),pnlNet:Number((gross-fee-Number(trade.fee||0)).toFixed(8)),feeBps:trade.feeBps,slippageBps:trade.slippageBps,status:result.exit==="STOP"?"PAPER_STOP":"PAPER_TARGET",ambiguousCandle:result.ambiguous,sourceCandleTime:bar.time,sourceCandleCloseTime:bar.closeTime,mode:"PAPER_ONLY",sourceVenue:venue};
     await d.lpush("tarotai:paper:ledger",JSON.stringify(closedTrade));triggered.push(closedTrade);closed.add(trade.id);break;
    }
   }
   await d.ltrim("tarotai:paper:ledger",0,999);
   return NextResponse.json({mode:"PAPER_ONLY",checkedSymbol:symbol,venue,sourceCandle:latest.candle,sourceCandleTime:latest.time,sourceCandleCloseTime:latest.closeTime,sourceCandleClosed:true,triggered,historyGaps,liveTradingEnabled:false,stopFirstOnAmbiguousCandle:true,note:"Only fully closed candles beginning after paper entry are evaluated; the first stop/target event is recorded."});
  }
  if(!["OPEN","CLOSE"].includes(action))return NextResponse.json({error:"action must be OPEN, CLOSE, REPLAY, STOP_CHECK, or TICK_CHECK"},{status:400});
  const symbol=String(b.symbol||"BTCUSDT").toUpperCase(),side=String(b.side||"").toUpperCase(),qty=Number(b.quantity),price=Number(b.price),feeBps=Number(b.feeBps??5),slipBps=Number(b.slippageBps??2),marketTime=Number(b.marketTime);
  if(!/^[A-Z0-9]{4,20}$/.test(symbol)||!["BUY","SELL"].includes(side)||![qty,price,feeBps,slipBps,marketTime].every(Number.isFinite)||qty<=0||price<=0||feeBps<0||feeBps>50||slipBps<0||slipBps>50)return NextResponse.json({error:"Invalid trade inputs; include marketTime and costs 0-50 bps"},{status:400});
  if(isStale(marketTime))return NextResponse.json({error:"Stale or missing market timestamp; refresh market data before paper trading"},{status:409});
  let verifiedMarketPrice:number;
  try{
   const marketUrl=new URL("https://fapi.binance.com/fapi/v1/klines");marketUrl.searchParams.set("symbol",symbol);marketUrl.searchParams.set("interval","1m");marketUrl.searchParams.set("limit","2");
   const marketResponse=await fetch(marketUrl,{cache:"no-store",signal:AbortSignal.timeout(6000)}),marketRows=await marketResponse.json();
   if(!marketResponse.ok||!Array.isArray(marketRows)||!marketRows.length)return NextResponse.json({error:"Fresh demo market price could not be verified; paper entry blocked"},{status:502});
   const latest=marketRows[marketRows.length-1],closeTime=Number(latest[6]);verifiedMarketPrice=Number(latest[4]);
   if(!Number.isFinite(closeTime)||!Number.isFinite(verifiedMarketPrice)||verifiedMarketPrice<=0||Date.now()-closeTime>120000||closeTime>Date.now()+60000)return NextResponse.json({error:"Server-side market data is stale or malformed; paper entry blocked"},{status:409});
  }catch{return NextResponse.json({error:"Market freshness verification failed; paper entry blocked"},{status:502});}
  if(action==="OPEN"&&Math.abs(price-verifiedMarketPrice)/verifiedMarketPrice>0.01)return NextResponse.json({error:"Entry price moved more than 1% from the server-verified live price; re-analyze the chart before paper entry",requestedPrice:price,verifiedMarketPrice},{status:409});
  if(action==="OPEN"){
   const existingRows=(await d.lrange("tarotai:paper:ledger",0,999)).map((x:any)=>typeof x==="string"?JSON.parse(x):x);
   const closedIds=new Set(existingRows.filter((x:any)=>x.parentTradeId&&["PAPER_CLOSE","PAPER_STOP","PAPER_TARGET"].includes(x.status)).map((x:any)=>x.parentTradeId));
   if(existingRows.some((x:any)=>x.status==="PAPER_OPEN"&&x.symbol===symbol&&!closedIds.has(x.id)))return NextResponse.json({error:"A paper position for this symbol is already open; close it before opening another"},{status:409});
  }
  let parentTrade:any=null;
  if(action==="CLOSE"){
   const parentTradeId=String(b.parentTradeId||"");
   if(!parentTradeId)return NextResponse.json({error:"CLOSE requires parentTradeId from an open paper position"},{status:400});
   const rows=(await d.lrange("tarotai:paper:ledger",0,999)).map((x:any)=>typeof x==="string"?JSON.parse(x):x);
   parentTrade=rows.find((x:any)=>x.id===parentTradeId&&x.status==="PAPER_OPEN");
   const alreadyClosed=rows.some((x:any)=>x.parentTradeId===parentTradeId&&["PAPER_CLOSE","PAPER_STOP","PAPER_TARGET"].includes(x.status));
   if(!parentTrade||alreadyClosed||parentTrade.symbol!==symbol||parentTrade.side===side||Math.abs(Number(parentTrade.quantity)-qty)>1e-10)return NextResponse.json({error:"Parent trade is missing, already closed, mismatched, or quantity must fully close the position"},{status:409});
  }
  const stopPrice=b.stopPrice==null?null:Number(b.stopPrice),targetPrice=b.targetPrice==null?null:Number(b.targetPrice);
  if(action==="OPEN"&&(stopPrice===null||targetPrice===null||!Number.isFinite(stopPrice)||!Number.isFinite(targetPrice)||!validateStops(side==="BUY"?"LONG":"SHORT",price,stopPrice,targetPrice)))return NextResponse.json({error:"Opening paper trade requires valid stop and target geometry"},{status:400});
  const fill=applySlippage(side,price,slipBps),fee=calculateFee(fill,qty,feeBps);
  const grossPnl=parentTrade?(parentTrade.side==="BUY"?(fill-Number(parentTrade.fillPrice))*qty:(Number(parentTrade.fillPrice)-fill)*qty):null;
  const suppliedSource=String(b.decisionSource||"");
  const decisionSource=["continuous-local-team","ai-eight-agent-review"].includes(suppliedSource)?suppliedSource:"manual-chart-signal";
  const signalCandleTime=Number.isFinite(Number(b.signalCandleTime))&&Number(b.signalCandleTime)>0?Number(b.signalCandleTime):null;
  const decisionAction=["BUY / LONG","SELL / SHORT"].includes(String(b.decisionAction||""))?String(b.decisionAction):null;
  const agentTeamModel=String(b.agentTeamModel||"unreported").slice(0,100);
  const roles=["market","entry","exits","sizing","discipline","position","journal","supervisor"];
  const agentVotes=Array.isArray(b.agentVotes)?b.agentVotes.slice(0,8).filter((v:any)=>v&&roles.includes(String(v.role))).map((v:any)=>({role:String(v.role),bias:["LONG","SHORT","WAIT"].includes(String(v.bias))?String(v.bias):"WAIT",veto:Boolean(v.veto),model:String(v.model||"unreported").slice(0,100),fallback:Boolean(v.fallback)})):[];
  const trade={id:crypto.randomUUID(),parentTradeId:parentTrade?.id||null,createdAt:new Date().toISOString(),symbol,side,quantity:qty,requestedPrice:price,verifiedMarketPrice,marketDataCheckedAt:new Date().toISOString(),marketSource:"Binance USDⓈ-M Futures public 1m candles",fillPrice:Number(fill.toFixed(8)),fee:Number(fee.toFixed(8)),pnlGross:grossPnl===null?null:Number(grossPnl.toFixed(8)),pnlNet:grossPnl===null?null:Number((grossPnl-fee-Number(parentTrade.fee||0)).toFixed(8)),feeBps,slippageBps:slipBps,stopPrice,targetPrice,status:"PAPER_"+action,mode:"PAPER_ONLY",
    decisionSource:parentTrade?.decisionSource||decisionSource,signalCandleTime:parentTrade?.signalCandleTime??signalCandleTime,decisionAction:parentTrade?.decisionAction||decisionAction,agentTeamModel:parentTrade?.agentTeamModel||agentTeamModel,agentVotes:parentTrade?.agentVotes||agentVotes};
  if([trade.stopPrice,trade.targetPrice].some((x:any)=>x!==null&&(!Number.isFinite(x)||x<=0)))return NextResponse.json({error:"Stop/target must be positive numbers"},{status:400});
  await d.lpush("tarotai:paper:ledger",JSON.stringify(trade));await d.ltrim("tarotai:paper:ledger",0,999);
  return NextResponse.json({accepted:true,trade,liveTradingEnabled:false,note:"Ledger-only simulation; no exchange order sent"},{status:201});
 }catch(e:any){return NextResponse.json({error:e?.message==="STORE_OFF"?"Persistent store unavailable; configure Upstash Redis":"Paper ledger write failed; no order was sent"},{status:503});}
}