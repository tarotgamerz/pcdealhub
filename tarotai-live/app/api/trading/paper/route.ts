import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { isAuthorized } from "../../../../lib/auth";
import { applySlippage, calculateFee, isStale, validateStops, resolveStopTarget, resolveTargetOnlyObservation, validatePaperExposure, validatePaperDailyRisk, PAPER_MAX_POSITION_EXPOSURE_PCT, PAPER_MAX_PORTFOLIO_EXPOSURE_PCT, PAPER_MAX_DAILY_LOSS_PCT, PAPER_MAX_ENTRIES_PER_UTC_DAY } from "../../../../lib/trading-rules.mjs";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const OPEN_POSITIONS_KEY="tarotai:paper:open_positions";
const STOP_CURSORS_KEY="tarotai:paper:stop_cursors";
function parseLedgerValue(x:any){return typeof x==="string"?JSON.parse(x):x;}
async function readPaperLedger(d:Redis){
 const [stored,indexed]=await Promise.all([
  d.lrange("tarotai:paper:ledger",0,999),
  d.hgetall<Record<string,string>>(OPEN_POSITIONS_KEY)
 ]);
 const rows=(stored||[]).map(parseLedgerValue),seen=new Set(rows.map((x:any)=>String(x?.id||"")).filter(Boolean));
 for(const [field,raw] of Object.entries(indexed||{})){
  const trade=parseLedgerValue(raw);
  if(!trade||typeof trade!=="object"||trade.id!==field||trade.status!=="PAPER_OPEN")throw new Error("Open-position index is malformed; paper ledger operations are blocked.");
  if(!seen.has(trade.id)){rows.push(trade);seen.add(trade.id);}
 }
 return rows;
}
function store(){const url=process.env.UPSTASH_REDIS_REST_URL,token=process.env.UPSTASH_REDIS_REST_TOKEN;if(!url||!token)throw new Error("STORE_OFF");return new Redis({url,token});}
export async function GET(req:Request){
 if(!process.env.TAROTAI_ACCESS_CODE)return NextResponse.json({error:"Private access is not configured"},{status:503});
 if(!isAuthorized(req))return NextResponse.json({error:"Authentication required"},{status:401});
 try{const d=store();const [ledger,replays]=await Promise.all([readPaperLedger(d),d.lrange("tarotai:paper:replays",0,19)]);return NextResponse.json({mode:"PAPER_ONLY",liveTradingEnabled:false,ledger,replays:replays.map((x:any)=>typeof x==="string"?JSON.parse(x):x),openPositionIndexActive:true,historyRetentionLimit:1000});}
 catch{return NextResponse.json({error:"Persistent store unavailable; configure Upstash Redis"},{status:503});}
}
export async function POST(req:Request){
 if(!process.env.TAROTAI_ACCESS_CODE)return NextResponse.json({error:"Private access is not configured"},{status:503});
 if(!isAuthorized(req))return NextResponse.json({error:"Authentication required"},{status:401});
 let b:any;try{b=await req.json()}catch{return NextResponse.json({error:"Expected JSON"},{status:400});}
 const action=String(b.action||"").toUpperCase();
 try{
  const d=store();
  const needsLedgerLock=["OPEN","CLOSE","STOP_CHECK","REPLAY"].includes(action);
  const lockKey="tarotai:paper:ledger:lock";
  const lockToken=crypto.randomUUID();
  if(needsLedgerLock){
   const acquired=await d.set(lockKey,lockToken,{nx:true,px:60000});
   if(!acquired)return NextResponse.json({error:"Another paper-ledger operation is in progress. Retry in a few seconds; no trade was changed."},{status:409});
  }
  try{
  if(action==="REPLAY"){
   const symbol=String(b.symbol||"BTCUSDT").toUpperCase(),venue=String(b.venue||"binance").toLowerCase(),interval=String(b.interval||"1m"),limit=Math.min(500,Math.max(20,Math.floor(Number(b.limit)||100)));
   if(!/^[A-Z0-9]{4,20}$/.test(symbol)||!["okx","bybit","binance"].includes(venue)||!["1m","3m","5m","15m","30m","1h","2h","4h","1d"].includes(interval))return NextResponse.json({error:"Invalid venue, symbol or interval"},{status:400});
   let candles:any[]=[];
   if(venue==="okx"){
    const instId=symbol.endsWith("USDT")?symbol.slice(0,-4)+"-USDT-SWAP":symbol,map:any={"1m":"1m","3m":"3m","5m":"5m","15m":"15m","30m":"30m","1h":"1H","2h":"2H","4h":"4H","1d":"1D"};
    const u=new URL("https://www.okx.com/api/v5/market/candles");u.searchParams.set("instId",instId);u.searchParams.set("bar",map[interval]);u.searchParams.set("limit",String(Math.min(limit,300)));
    const r=await fetch(u,{cache:"no-store",signal:AbortSignal.timeout(8000)}),raw=await r.json();
    if(!r.ok||raw?.code!=="0"||!Array.isArray(raw?.data)||!raw.data.length)return NextResponse.json({error:"OKX market replay request failed",detail:raw?.msg||"No candles"},{status:502});
    candles=raw.data.slice().reverse().map((k:any[])=>({time:+k[0],open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5],closeTime:+k[0]+({"1m":60000,"3m":180000,"5m":300000,"15m":900000,"30m":1800000,"1h":3600000,"2h":7200000,"4h":14400000,"1d":86400000}[interval]||60000)-1}));
   }else if(venue==="bybit"){
    const map:any={"1m":"1","3m":"3","5m":"5","15m":"15","30m":"30","1h":"60","2h":"120","4h":"240","1d":"D"};
    const u=new URL("https://api.bybit.com/v5/market/kline");u.searchParams.set("category","linear");u.searchParams.set("symbol",symbol);u.searchParams.set("interval",map[interval]);u.searchParams.set("limit",String(Math.min(limit,1000)));
    const r=await fetch(u,{cache:"no-store",signal:AbortSignal.timeout(8000)}),raw=await r.json();
    if(!r.ok||raw?.retCode!==0||!Array.isArray(raw?.result?.list)||!raw.result.list.length)return NextResponse.json({error:"Bybit market replay request failed",detail:raw?.retMsg||"No candles"},{status:502});
    candles=raw.result.list.slice().reverse().map((k:any[])=>({time:+k[0],open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5],closeTime:+k[0]+({"1m":60000,"3m":180000,"5m":300000,"15m":900000,"30m":1800000,"1h":3600000,"2h":7200000,"4h":14400000,"1d":86400000}[interval]||60000)-1}));
   }else{
    const u=new URL("https://fapi.binance.com/fapi/v1/klines");u.searchParams.set("symbol",symbol);u.searchParams.set("interval",interval);u.searchParams.set("limit",String(limit));
    const r=await fetch(u,{cache:"no-store",signal:AbortSignal.timeout(8000)}),raw=await r.json();
    if(!r.ok||!Array.isArray(raw)||!raw.length)return NextResponse.json({error:"Binance market replay request failed",detail:raw?.msg||"No candles"},{status:502});
    candles=raw.map((k:any[])=>({time:+k[0],open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5],closeTime:+k[6]}));
   }
   if(candles.length<20||candles.some((c:any)=>![c.time,c.open,c.high,c.low,c.close,c.volume,c.closeTime].every(Number.isFinite)||c.high<c.low||c.close<=0))return NextResponse.json({error:"Malformed or insufficient candles rejected"},{status:502});
   const replay={id:crypto.randomUUID(),createdAt:new Date().toISOString(),venue,symbol,interval,candleCount:candles.length,candles};
   await d.lpush("tarotai:paper:replays",JSON.stringify(replay));await d.ltrim("tarotai:paper:replays",0,19);
   return NextResponse.json({mode:"PAPER_ONLY",replayId:replay.id,venue,candles,stored:true,liveTradingEnabled:false});
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
     url=new URL("https://api.bybit.com/v5/market/kline");url.searchParams.set("category","linear");url.searchParams.set("symbol",symbol);url.searchParams.set("interval","1");url.searchParams.set("limit","500");
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
   const rows=await readPaperLedger(d);
   const closed=new Set(rows.filter((x:any)=>x.parentTradeId&&["PAPER_CLOSE","PAPER_STOP","PAPER_TARGET"].includes(x.status)).map((x:any)=>x.parentTradeId));
   for(const id of closed){await d.hdel(OPEN_POSITIONS_KEY,id);await d.hdel(STOP_CURSORS_KEY,id);}
   const indexedOpenRows=rows.filter((x:any)=>x.status==="PAPER_OPEN"&&!closed.has(x.id));
   for(const openTrade of indexedOpenRows)await d.hset(OPEN_POSITIONS_KEY,{[openTrade.id]:JSON.stringify(openTrade)});
   const triggered:any[]=[],historyGaps:any[]=[],ambiguousObservationCandles:any[]=[];
   for(const trade of indexedOpenRows.filter((x:any)=>x.symbol===symbol&&(x.venue||"binance")===venue&&x.stopPrice&&x.targetPrice)){
    const openedAt=Date.parse(trade.createdAt),targetOnlyObservation=trade.experimentMode==="target-only-observation";
    if(!Number.isFinite(openedAt))continue;
    const cursorRaw=await d.hget<string|number>(STOP_CURSORS_KEY,trade.id);
    const lastProcessedTime=cursorRaw===null||cursorRaw===undefined?Number.NaN:Number(cursorRaw);
    const hasCursor=Number.isFinite(lastProcessedTime)&&lastProcessedTime>0;
    // A durable cursor preserves progress beyond the exchange's limited 500-candle response window.
    // If the server was offline long enough to lose unprocessed candles, fail closed and report the history gap.
    if(openedAt<closedCandles[0].time&&!hasCursor&&!targetOnlyObservation){historyGaps.push({tradeId:trade.id,createdAt:trade.createdAt,oldestAvailableCandleTime:closedCandles[0].time});continue;}
    if(hasCursor&&closedCandles[0].time>lastProcessedTime+60000){historyGaps.push({tradeId:trade.id,createdAt:trade.createdAt,lastProcessedCandleTime:lastProcessedTime,oldestAvailableCandleTime:closedCandles[0].time});continue;}
    let processedThrough=hasCursor?lastProcessedTime:0;
    const eligible=closedCandles.filter((bar:any)=>bar.time>openedAt&&(!hasCursor||bar.time>lastProcessedTime));
    for(const bar of eligible){
     const result=targetOnlyObservation
      ?resolveTargetOnlyObservation(bar.candle,trade.side==="BUY"?"LONG":"SHORT",Number(trade.stopPrice),Number(trade.targetPrice))
      :resolveStopTarget(bar.candle,trade.side==="BUY"?"LONG":"SHORT",Number(trade.stopPrice),Number(trade.targetPrice));
     if(targetOnlyObservation&&result.ambiguous)ambiguousObservationCandles.push({tradeId:trade.id,candleTime:bar.time});
     if(!result.exit||result.price===null){processedThrough=bar.time;continue;}
     const closeSide=trade.side==="BUY"?"SELL":"BUY",fill=applySlippage(closeSide,Number(result.price),Number(trade.slippageBps)),fee=calculateFee(fill,Number(trade.quantity),Number(trade.feeBps));
     const gross=trade.side==="BUY"?(fill-Number(trade.fillPrice))*Number(trade.quantity):(Number(trade.fillPrice)-fill)*Number(trade.quantity);
     const closedTrade={id:crypto.randomUUID(),parentTradeId:trade.id,createdAt:new Date().toISOString(),symbol,side:closeSide,quantity:trade.quantity,requestedPrice:result.price,fillPrice:Number(fill.toFixed(8)),fee:Number(fee.toFixed(8)),pnlGross:Number(gross.toFixed(8)),pnlNet:Number((gross-fee-Number(trade.fee||0)).toFixed(8)),feeBps:trade.feeBps,slippageBps:trade.slippageBps,status:result.exit==="STOP"?"PAPER_STOP":"PAPER_TARGET",ambiguousCandle:result.ambiguous,sourceCandleTime:bar.time,sourceCandleCloseTime:bar.closeTime,mode:"PAPER_ONLY",experimentMode:trade.experimentMode||null,sourceVenue:venue};
     await d.lpush("tarotai:paper:ledger",JSON.stringify(closedTrade));await d.hdel(OPEN_POSITIONS_KEY,trade.id);await d.hdel(STOP_CURSORS_KEY,trade.id);triggered.push(closedTrade);closed.add(trade.id);break;
    }
    if(!closed.has(trade.id)&&processedThrough>(hasCursor?lastProcessedTime:0))await d.hset(STOP_CURSORS_KEY,{[trade.id]:processedThrough});
   }
   await d.ltrim("tarotai:paper:ledger",0,999);
   return NextResponse.json({mode:"PAPER_ONLY",checkedSymbol:symbol,venue,sourceCandle:latest.candle,sourceCandleTime:latest.time,sourceCandleCloseTime:latest.closeTime,sourceCandleClosed:true,triggered,historyGaps,ambiguousObservationCandles,liveTradingEnabled:false,stopFirstOnAmbiguousCandle:true,note:"Strategy positions use stop-first exits on closed candles. Target-only observation trades ignore stop touches, close only when a profit target is confirmed without an ambiguous stop touch, and remain open otherwise."});
  }
  if(!["OPEN","CLOSE"].includes(action))return NextResponse.json({error:"action must be OPEN, CLOSE, REPLAY, or STOP_CHECK"},{status:400});
  const symbol=String(b.symbol||"BTCUSDT").toUpperCase(),venue=String(b.venue||"binance").toLowerCase(),side=String(b.side||"").toUpperCase(),qty=Number(b.quantity),price=Number(b.price),feeBps=Number(b.feeBps??5),slipBps=Number(b.slippageBps??2),marketTime=Number(b.marketTime);
  if(!/^[A-Z0-9]{4,20}$/.test(symbol)||!["okx","bybit","binance"].includes(venue)||!["BUY","SELL"].includes(side)||![qty,price,feeBps,slipBps,marketTime].every(Number.isFinite)||qty<=0||price<=0||feeBps<0||feeBps>50||slipBps<0||slipBps>50)return NextResponse.json({error:"Invalid trade inputs; include marketTime and costs 0-50 bps"},{status:400});
  if(isStale(marketTime))return NextResponse.json({error:"Stale or missing market timestamp; refresh market data before paper trading"},{status:409});
  let verifiedMarketPrice:number,executionReferencePrice=price,marketSource="",verifiedSpreadBps=Number.NaN,verifiedBidPrice=Number.NaN,verifiedAskPrice=Number.NaN;
  try{
   let marketResponse:Response,marketQuote:any;
   if(venue==="okx"){
    const instId=symbol.endsWith("USDT")?symbol.slice(0,-4)+"-USDT-SWAP":symbol;
    const marketUrl=new URL("https://www.okx.com/api/v5/market/ticker");marketUrl.searchParams.set("instId",instId);
    marketResponse=await fetch(marketUrl,{cache:"no-store",signal:AbortSignal.timeout(6000)});marketQuote=await marketResponse.json();
    const ticker=marketQuote?.code==="0"&&Array.isArray(marketQuote?.data)?marketQuote.data[0]:null;
    const timestamp=Number(ticker?.ts),ageMs=Date.now()-timestamp;
    if(!marketResponse.ok||!Number.isFinite(Number(ticker?.last))||Number(ticker?.last)<=0||!Number.isFinite(timestamp)||timestamp<=0||ageMs< -1500||ageMs>5000)return NextResponse.json({error:"Fresh OKX swap ticker could not be verified or is older than five seconds; paper trade blocked",ageMs:Number.isFinite(ageMs)?ageMs:null},{status:502});
    const bid=Number(ticker.bidPx),ask=Number(ticker.askPx);
    verifiedBidPrice=bid;verifiedAskPrice=ask;
    verifiedSpreadBps=Number.isFinite(bid)&&Number.isFinite(ask)&&bid>0&&ask>=bid?((ask-bid)/((ask+bid)/2))*10000:Number.NaN;
    if(action==="OPEN"&&!Number.isFinite(verifiedSpreadBps))return NextResponse.json({error:"Paper entry blocked: current OKX bid-ask spread could not be verified."},{status:502});
    verifiedMarketPrice=Number(ticker.last);marketSource="OKX public swap last-trade ticker";
   }else if(venue==="bybit"){
    const marketUrl=new URL("https://api.bybit.com/v5/market/tickers");marketUrl.searchParams.set("category","linear");marketUrl.searchParams.set("symbol",symbol);
    marketResponse=await fetch(marketUrl,{cache:"no-store",signal:AbortSignal.timeout(6000)});marketQuote=await marketResponse.json();
    const ticker=marketQuote?.retCode===0&&Array.isArray(marketQuote?.result?.list)?marketQuote.result.list[0]:null;
    const timestamp=Number(marketQuote?.time),ageMs=Date.now()-timestamp;
    if(!marketResponse.ok||!Number.isFinite(Number(ticker?.lastPrice))||Number(ticker?.lastPrice)<=0||!Number.isFinite(timestamp)||timestamp<=0||ageMs< -1500||ageMs>5000)return NextResponse.json({error:"Fresh Bybit linear ticker could not be verified or is older than five seconds; paper trade blocked",ageMs:Number.isFinite(ageMs)?ageMs:null},{status:502});
    const bid=Number(ticker.bid1Price),ask=Number(ticker.ask1Price);
    verifiedBidPrice=bid;verifiedAskPrice=ask;
    verifiedSpreadBps=Number.isFinite(bid)&&Number.isFinite(ask)&&bid>0&&ask>=bid?((ask-bid)/((ask+bid)/2))*10000:Number.NaN;
    if(action==="OPEN"&&!Number.isFinite(verifiedSpreadBps))return NextResponse.json({error:"Paper entry blocked: current Bybit bid-ask spread could not be verified."},{status:502});
    verifiedMarketPrice=Number(ticker.lastPrice);marketSource="Bybit linear-perpetual public last-trade ticker";
   }else{
    // A single exchange-timestamped order-book snapshot supplies both sides.
    // Midpoint is the consistency reference; simulated execution uses side-specific bid/ask.
    const marketUrl=new URL("https://fapi.binance.com/fapi/v1/ticker/bookTicker");marketUrl.searchParams.set("symbol",symbol);
    marketResponse=await fetch(marketUrl,{cache:"no-store",signal:AbortSignal.timeout(6000)});marketQuote=await marketResponse.json().catch(()=>null);
    const bid=Number(marketQuote?.bidPrice),ask=Number(marketQuote?.askPrice),timestamp=Number(marketQuote?.time),ageMs=Date.now()-timestamp;
    if(!marketResponse.ok||marketQuote?.symbol!==symbol||!Number.isFinite(bid)||!Number.isFinite(ask)||bid<=0||ask<bid||!Number.isFinite(timestamp)||timestamp<=0||ageMs < -1500||ageMs>5000)return NextResponse.json({error:"Fresh Binance USDⓈ-M Futures order-book quote could not be verified; paper trade blocked",ageMs:Number.isFinite(ageMs)?ageMs:null},{status:502});
    verifiedBidPrice=bid;verifiedAskPrice=ask;verifiedMarketPrice=(bid+ask)/2;
    verifiedSpreadBps=((ask-bid)/verifiedMarketPrice)*10000;marketSource="Binance USDⓈ-M Futures timestamped order-book midpoint";
   }
   if(!Number.isFinite(verifiedMarketPrice)||verifiedMarketPrice<=0)return NextResponse.json({error:"Server-side market price is malformed; paper trade blocked"},{status:409});
   if(action==="OPEN"&&(!Number.isFinite(verifiedSpreadBps)||verifiedSpreadBps<0||verifiedSpreadBps>20))return NextResponse.json({error:"Paper entry blocked: bid-ask spread is unavailable or exceeds the 20 bps safety limit.",spreadBps:Number.isFinite(verifiedSpreadBps)?verifiedSpreadBps:null,maxAllowedSpreadBps:20},{status:409});
   const priceDrift=Math.abs(price-verifiedMarketPrice)/verifiedMarketPrice;
   if(action==="OPEN"&&priceDrift>0.002)return NextResponse.json({error:"Paper entry blocked: chart price differs from the server-verified "+venue.toUpperCase()+" price reference by "+(priceDrift*100).toFixed(3)+"%. Refresh the live chart before retrying.",verifiedMarketPrice,submittedPrice:price,maxAllowedDriftPct:0.2},{status:409});
   // Simulated market fills cross the spread in the order's direction, then apply adverse slippage.
   const canUseBook=Number.isFinite(verifiedBidPrice)&&Number.isFinite(verifiedAskPrice)&&verifiedBidPrice>0&&verifiedAskPrice>=verifiedBidPrice;
   executionReferencePrice=canUseBook?(side==="BUY"?verifiedAskPrice:verifiedBidPrice):verifiedMarketPrice;
  }catch{return NextResponse.json({error:"Market freshness verification failed; paper entry blocked"},{status:502});}
  if(action==="OPEN"&&Math.abs(price-verifiedMarketPrice)/verifiedMarketPrice>0.01)return NextResponse.json({error:"Entry price moved more than 1% from the server-verified live price; re-analyze the chart before paper entry",requestedPrice:price,verifiedMarketPrice},{status:409});
  let existingOpenExposure=0;
  if(action==="OPEN"){
   const existingRows=await readPaperLedger(d);
   const closedIds=new Set(existingRows.filter((x:any)=>x.parentTradeId&&["PAPER_CLOSE","PAPER_STOP","PAPER_TARGET"].includes(x.status)).map((x:any)=>x.parentTradeId));
   for(const id of closedIds)await d.hdel(OPEN_POSITIONS_KEY,id);
   const openRows=existingRows.filter((x:any)=>x.status==="PAPER_OPEN"&&!closedIds.has(x.id));
   for(const openTrade of openRows)await d.hset(OPEN_POSITIONS_KEY,{[openTrade.id]:JSON.stringify(openTrade)});
   if(openRows.some((x:any)=>x.symbol===symbol))return NextResponse.json({error:"A paper position for this symbol is already open; close it before opening another"},{status:409});
   if(openRows.some((x:any)=>!Number.isFinite(Number(x.paperBalance))||Number(x.paperBalance)<=0))return NextResponse.json({error:"A legacy open paper position has no recorded starting balance. Close legacy positions before opening another trade."},{status:409});
   const openBalances=openRows.map((x:any)=>Number(x.paperBalance));
   if(openBalances.some((value:number)=>Math.abs(value-openBalances[0])>Math.max(0.01,openBalances[0]*1e-9)))return NextResponse.json({error:"Open paper positions have inconsistent recorded balances. Close all open positions before continuing."},{status:409});
   const requestedBalance=Number(b.paperBalance);
   if(openBalances.length&&Number.isFinite(requestedBalance)&&Math.abs(requestedBalance-openBalances[0])>Math.max(0.01,openBalances[0]*1e-9))return NextResponse.json({error:"Paper starting balance is locked while positions are open. Use "+openBalances[0].toFixed(2)+" USDT or close all open positions first."},{status:409});
   if(!Number.isFinite(requestedBalance)||requestedBalance<100||requestedBalance>10000000)return NextResponse.json({error:"Invalid daily paper starting balance; entry is blocked."},{status:400});
   const utcDay=new Date().toISOString().slice(0,10),dailyBalanceKey="tarotai:paper:daily_balance:"+utcDay;
   await d.set(dailyBalanceKey,String(requestedBalance),{nx:true,ex:172800});
   const dailyBaseline=Number(await d.get(dailyBalanceKey));
   if(!Number.isFinite(dailyBaseline)||dailyBaseline<100||dailyBaseline>10000000)return NextResponse.json({error:"Daily paper starting balance could not be verified; entry is blocked."},{status:503});
   if(Math.abs(requestedBalance-dailyBaseline)>Math.max(0.01,dailyBaseline*1e-9))return NextResponse.json({error:"Daily paper starting balance is locked for today at "+dailyBaseline.toFixed(2)+" USDT. Keep today's configured amount; it can reset next UTC day."},{status:409});
   const dailyRiskError=validatePaperDailyRisk({ledger:existingRows,balance:dailyBaseline,now:Date.now()});
   if(dailyRiskError)return NextResponse.json({error:dailyRiskError,limits:{maxDailyLossPct:PAPER_MAX_DAILY_LOSS_PCT,maxEntriesPerUtcDay:PAPER_MAX_ENTRIES_PER_UTC_DAY}},{status:409});
   existingOpenExposure=openRows.reduce((sum:number,x:any)=>sum+Number(x.fillPrice||x.verifiedMarketPrice||x.requestedPrice)*Number(x.quantity),0);
   if(!Number.isFinite(existingOpenExposure)||existingOpenExposure<0)return NextResponse.json({error:"Existing paper exposure is malformed; opening another position is blocked"},{status:409});
  }
  let parentTrade:any=null;
  if(action==="CLOSE"){
   const parentTradeId=String(b.parentTradeId||"");
   if(!parentTradeId)return NextResponse.json({error:"CLOSE requires parentTradeId from an open paper position"},{status:400});
   const rows=await readPaperLedger(d);
   parentTrade=rows.find((x:any)=>x.id===parentTradeId&&x.status==="PAPER_OPEN");
   const alreadyClosed=rows.some((x:any)=>x.parentTradeId===parentTradeId&&["PAPER_CLOSE","PAPER_STOP","PAPER_TARGET"].includes(x.status));
   if(!parentTrade||alreadyClosed||parentTrade.symbol!==symbol||(parentTrade.venue&&parentTrade.venue!==venue)||parentTrade.side===side||Math.abs(Number(parentTrade.quantity)-qty)>1e-10)return NextResponse.json({error:"Parent trade is missing, already closed, mismatched, or quantity must fully close the position"},{status:409});
  }
  const stopPrice=b.stopPrice==null?null:Number(b.stopPrice),targetPrice=b.targetPrice==null?null:Number(b.targetPrice);
  if(action==="OPEN"&&(stopPrice===null||targetPrice===null||!Number.isFinite(stopPrice)||!Number.isFinite(targetPrice)||!validateStops(side==="BUY"?"LONG":"SHORT",executionReferencePrice,stopPrice,targetPrice)))return NextResponse.json({error:"Opening paper trade requires valid stop and target geometry"},{status:400});
  const paperBalance=Number(b.paperBalance),riskPct=Number(b.riskPct),maxExposurePct=Number(b.maxExposurePct);
  if(action==="OPEN"){
   if(![paperBalance,riskPct,maxExposurePct].every(Number.isFinite)||paperBalance<100||paperBalance>10000000||riskPct<0.1||riskPct>1||maxExposurePct<=0||maxExposurePct>PAPER_MAX_POSITION_EXPOSURE_PCT)return NextResponse.json({error:"Paper entry blocked: balance, risk, or exposure settings are outside the server-enforced limits."},{status:400});
   const riskError=validatePaperExposure({balance:paperBalance,riskPct,entry:executionReferencePrice,stop:Number(stopPrice),quantity:qty,existingExposure:existingOpenExposure,maxExposurePct,maxTotalExposurePct:PAPER_MAX_PORTFOLIO_EXPOSURE_PCT});
   if(riskError)return NextResponse.json({error:riskError,limits:{maxPositionExposurePct:PAPER_MAX_POSITION_EXPOSURE_PCT,maxPortfolioExposurePct:PAPER_MAX_PORTFOLIO_EXPOSURE_PCT,maxRiskPct:1}},{status:409});
  }
  const fill=applySlippage(side,executionReferencePrice,slipBps),fee=calculateFee(fill,qty,feeBps);
  const grossPnl=parentTrade?(parentTrade.side==="BUY"?(fill-Number(parentTrade.fillPrice))*qty:(Number(parentTrade.fillPrice)-fill)*qty):null;
  const suppliedSource=String(b.decisionSource||"");
  const experimentMode=action==="OPEN"&&b.experimentMode==="target-only-observation"?"target-only-observation":parentTrade?.experimentMode==="target-only-observation"?"target-only-observation":null;
  const decisionSource=experimentMode?"target-only-observation":["continuous-local-team","ai-eight-agent-review"].includes(suppliedSource)?suppliedSource:"manual-chart-signal";
  const signalCandleTime=experimentMode?null:(Number.isFinite(Number(b.signalCandleTime))&&Number(b.signalCandleTime)>0?Number(b.signalCandleTime):null);
  const decisionAction=experimentMode?null:(["BUY / LONG","SELL / SHORT"].includes(String(b.decisionAction||""))?String(b.decisionAction):null);
  const agentTeamModel=String(b.agentTeamModel||"unreported").slice(0,100);
  const observationAgentAction=["BUY / LONG","SELL / SHORT","HOLD / WAIT"].includes(String(b.observationAgentAction||""))?String(b.observationAgentAction):null;
  const observationCandleTime=Number.isFinite(Number(b.observationCandleTime))&&Number(b.observationCandleTime)>0?Number(b.observationCandleTime):null;
  const observationCycle=Number.isFinite(Number(b.observationCycle))?Math.max(0,Math.min(100000000,Math.floor(Number(b.observationCycle)))):null;
  const experimentObservation=parentTrade?.experimentObservation||(experimentMode?{agentDecisionAtEntry:observationAgentAction,candleTime:observationCandleTime,cycle:observationCycle,note:"Operator-directed paper observation; not an agent-generated trading signal."}:null);
  const roles=["market","entry","exits","sizing","discipline","position","journal","supervisor"];
  const agentVotes=Array.isArray(b.agentVotes)?b.agentVotes.slice(0,8).filter((v:any)=>v&&roles.includes(String(v.role))).map((v:any)=>({role:String(v.role),bias:["LONG","SHORT","WAIT"].includes(String(v.bias))?String(v.bias):"WAIT",veto:Boolean(v.veto),model:String(v.model||"unreported").slice(0,100),fallback:Boolean(v.fallback)})):[];
  const trade={id:crypto.randomUUID(),parentTradeId:parentTrade?.id||null,createdAt:new Date().toISOString(),symbol,side,quantity:qty,requestedPrice:price,verifiedMarketPrice,marketDataCheckedAt:new Date().toISOString(),venue,marketSource,fillPrice:Number(fill.toFixed(8)),fee:Number(fee.toFixed(8)),pnlGross:grossPnl===null?null:Number(grossPnl.toFixed(8)),pnlNet:grossPnl===null?null:Number((grossPnl-fee-Number(parentTrade.fee||0)).toFixed(8)),feeBps,slippageBps:slipBps,spreadBps:Number.isFinite(verifiedSpreadBps)?Number(verifiedSpreadBps.toFixed(4)):null,fillNotional:Number((qty*fill).toFixed(8)),paperBalance:action==="OPEN"?paperBalance:(parentTrade?.paperBalance??null),riskPct:action==="OPEN"?riskPct:(parentTrade?.riskPct??null),maxExposurePct:action==="OPEN"?maxExposurePct:(parentTrade?.maxExposurePct??null),plannedRisk:action==="OPEN"?Number((qty*Math.abs(executionReferencePrice-Number(stopPrice))).toFixed(8)):(parentTrade?.plannedRisk??null),stopPrice,targetPrice,status:"PAPER_"+action,mode:"PAPER_ONLY",experimentMode:experimentMode||null,experimentObservation,
    decisionSource:parentTrade?.decisionSource||decisionSource,signalCandleTime:parentTrade?.signalCandleTime??signalCandleTime,decisionAction:parentTrade?.decisionAction||decisionAction,agentTeamModel:parentTrade?.agentTeamModel||agentTeamModel,agentVotes:parentTrade?.agentVotes||agentVotes};
  if([trade.stopPrice,trade.targetPrice].some((x:any)=>x!==null&&(!Number.isFinite(x)||x<=0)))return NextResponse.json({error:"Stop/target must be positive numbers"},{status:400});
  await d.lpush("tarotai:paper:ledger",JSON.stringify(trade));
  if(action==="OPEN")await d.hset(OPEN_POSITIONS_KEY,{[trade.id]:JSON.stringify(trade)});
  if(action==="CLOSE"&&parentTrade){await d.hdel(OPEN_POSITIONS_KEY,parentTrade.id);await d.hdel(STOP_CURSORS_KEY,parentTrade.id);}
  await d.ltrim("tarotai:paper:ledger",0,999);
  return NextResponse.json({accepted:true,trade,liveTradingEnabled:false,note:"Ledger-only simulation; no exchange order sent",openPositionIndexUpdated:true},{status:201});
  }finally{
   if(needsLedgerLock){
    try{await d.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",[lockKey],[lockToken]);}catch{}
   }
  }
 }catch(e:any){return NextResponse.json({error:e?.message==="STORE_OFF"?"Persistent store unavailable; configure Upstash Redis":"Paper ledger write failed; no order was sent"},{status:503});}
}