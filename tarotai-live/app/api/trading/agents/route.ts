import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { findSimilarCases } from "@/lib/market-patterns.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const ALLOWED_INTERVALS = ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "1d"] as const;
type Interval = typeof ALLOWED_INTERVALS[number];
type Venue = "binance" | "bybit" | "okx";
type Candle = { time:number; open:number; high:number; low:number; close:number; volume:number; closeTime:number };
const INTERVAL_MS: Record<Interval, number> = {"1m":60000,"3m":180000,"5m":300000,"15m":900000,"30m":1800000,"1h":3600000,"2h":7200000,"4h":14400000,"1d":86400000};
const HIGHER: Record<string, Interval> = {"1m":"15m","3m":"15m","5m":"1h","15m":"4h","30m":"4h","1h":"1d","2h":"1d","4h":"1d","1d":"1d"};
const BYBIT_INTERVAL: Record<Interval,string> = {"1m":"1","3m":"3","5m":"5","15m":"15","30m":"30","1h":"60","2h":"120","4h":"240","1d":"D"};
const OKX_INTERVAL: Record<Interval,string> = {"1m":"1m","3m":"3m","5m":"5m","15m":"15m","30m":"30m","1h":"1H","2h":"2H","4h":"4H","1d":"1D"};
const SPECIALISTS: Record<string,{name:string;focus:string;instruction:string}> = {
 trend:{name:"Trend & Regime",focus:"trend persistence, EMA slope and trend-vs-range",instruction:"Judge trend structure and regime. Distinguish clean trend from late/extended movement and chop. EMA alignment alone is not an entry."},
 structure:{name:"Market Structure",focus:"breakouts, breakdowns, failed breaks and pullbacks",instruction:"Identify meaningful range/swing structure and whether a CLOSED candle broke it. Look for wick sweeps and failed breakouts. Do not call wick-only moves confirmed breaks."},
 momentum:{name:"Momentum & RSI",focus:"RSI, impulse quality, exhaustion and follow-through",instruction:"Assess whether momentum confirms price direction or is exhausted/diverging. RSI thresholds alone are not a signal; avoid chasing extended candles."},
 volatility:{name:"Volatility & ATR",focus:"volatility regime, ATR expansion/compression and stop feasibility",instruction:"Assess ATR expansion/compression, shock candles and whether a stop can sit outside normal noise. Veto disorderly volatility; large candles alone do not imply edge."},
 volume:{name:"Volume & Participation",focus:"relative volume, candle close location and participation",instruction:"Use volume as relative participation evidence. Flag missing/flat volume, climactic candles and weak-close breaks. Do not infer order-book flow or funding from OHLCV."},
 timeframe:{name:"Higher-Timeframe Analyst",focus:"higher-timeframe regime vs entry timeframe",instruction:"Compare higher-timeframe candles/summary with the entry timeframe. Treat disagreement as a strong reason to WAIT; do not invent structure."},
 risk:{name:"Risk & Red-Team Veto",focus:"failure scenarios, costs, entry/stop/target geometry",instruction:"Try to disprove the best-looking setup. Inspect stop placement, reward/risk, volatility and plausible failure paths. Return VETO: YES if evidence is weak or risk asymmetric."}
};
const VENUE_ORDER: Venue[] = ["binance","bybit","okx"];

function jsonError(error:string,status:number,extra:Record<string,unknown>={}) {return NextResponse.json({error,...extra},{status,headers:{"Cache-Control":"no-store"}});}
function validateCandles(raw:any,interval:Interval,venue:Venue):Candle[] {
 let rows:any[]=[];
 if(venue==="binance"&&Array.isArray(raw))rows=raw.filter((x:any)=>Array.isArray(x)&&x.length>=9).map((x:any[])=>({time:Number(x[0]),open:Number(x[1]),high:Number(x[2]),low:Number(x[3]),close:Number(x[4]),volume:Number(x[5]),closeTime:Number(x[6])}));
 else if(venue==="bybit"&&raw?.retCode===0&&Array.isArray(raw?.result?.list))rows=raw.result.list.map((x:any[])=>({time:Number(x[0]),open:Number(x[1]),high:Number(x[2]),low:Number(x[3]),close:Number(x[4]),volume:Number(x[5]),closeTime:Number(x[0])+INTERVAL_MS[interval]-1}));
 else if(venue==="okx"&&raw?.code==="0"&&Array.isArray(raw?.data))rows=raw.data.map((x:any[])=>({time:Number(x[0]),open:Number(x[1]),high:Number(x[2]),low:Number(x[3]),close:Number(x[4]),volume:Number(x[5]),closeTime:Number(x[0])+INTERVAL_MS[interval]-1,confirmed:String(x[8]??"0")==="1"})).reverse();
 const seen=new Set<number>();
 return rows.filter((c:any)=>{
  if(![c.time,c.open,c.high,c.low,c.close,c.volume,c.closeTime].every(Number.isFinite))return false;
  if(c.time<=0||c.open<=0||c.close<=0||c.low<=0||c.volume<0||c.high<Math.max(c.open,c.close,c.low)||c.low>Math.min(c.open,c.close,c.high))return false;
  if(c.confirmed===false||seen.has(c.time)||c.closeTime>=Date.now()-250)return false;
  seen.add(c.time);return true;
 }).sort((a,b)=>a.time-b.time);
}
async function requestJson(url:URL) {
 const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(4500),headers:{"User-Agent":"TarotAI-Public-Market-Research"}});
 const raw=await response.text();let data:any;
 try{data=JSON.parse(raw);}catch{throw new Error("Exchange returned non-JSON data (HTTP "+response.status+").");}
 if(!response.ok)throw new Error(String(data?.msg||data?.retMsg||data?.message||"HTTP "+response.status));
 return data;
}
async function fetchVenue(venue:Venue,symbol:string,interval:Interval,limit:number):Promise<{candles:Candle[];host:string}> {
 if(venue==="binance") {
  const hosts=["fapi.binance.com","fapi1.binance.com","fapi2.binance.com","fapi3.binance.com"];
  const attempts=await Promise.allSettled(hosts.map(async host=>{
   const url=new URL("https://"+host+"/fapi/v1/klines");url.searchParams.set("symbol",symbol);url.searchParams.set("interval",interval);url.searchParams.set("limit",String(limit));
   const raw=await requestJson(url),candles=validateCandles(raw,interval,venue);if(candles.length<60)throw new Error("Only "+candles.length+" closed candles.");
   return {candles,host};
  }));
  const good=attempts.find((x:any)=>x.status==="fulfilled") as PromiseFulfilledResult<{candles:Candle[];host:string}>|undefined;
  if(good)return good.value;
  throw new Error(attempts.map((x:any)=>x.status==="rejected"?String(x.reason?.message||x.reason):"").filter(Boolean).join("; ").slice(0,500)||"Binance hosts unavailable.");
 }
 if(venue==="bybit") {
  const url=new URL("https://api.bybit.com/v5/market/kline");url.searchParams.set("category","linear");url.searchParams.set("symbol",symbol);url.searchParams.set("interval",BYBIT_INTERVAL[interval]);url.searchParams.set("limit",String(Math.min(limit,1000)));
  const raw=await requestJson(url),candles=validateCandles(raw,interval,venue);if(candles.length<60)throw new Error("Only "+candles.length+" closed candles.");return {candles,host:"api.bybit.com"};
 }
 const instrument=symbol.endsWith("USDT")?symbol.slice(0,-4)+"-USDT-SWAP":symbol;
 const url=new URL("https://www.okx.com/api/v5/market/candles");url.searchParams.set("instId",instrument);url.searchParams.set("bar",OKX_INTERVAL[interval]);url.searchParams.set("limit",String(Math.min(limit,300)));
 const raw=await requestJson(url),candles=validateCandles(raw,interval,venue);if(candles.length<60)throw new Error("Only "+candles.length+" closed candles.");return {candles,host:"www.okx.com"};
}
async function fetchVerifiedMarket(symbol:string,interval:Interval,preferred:Venue) {
 const venues=[preferred,...VENUE_ORDER.filter(v=>v!==preferred)],failures:string[]=[];
 for(const venue of venues) {
  try {
   const higher=HIGHER[interval];
   const [mainResult,higherResult]=await Promise.all([fetchVenue(venue,symbol,interval,250),fetchVenue(venue,symbol,higher,180)]);
   const candles=mainResult.candles.slice(-250),higherCandles=higherResult.candles.slice(-180);
   if(candles.length<80||higherCandles.length<55)throw new Error("Not enough closed candles on main/higher timeframe.");
   const now=Date.now(),last=candles[candles.length-1],ageMs=now-last.closeTime;
   if(ageMs>INTERVAL_MS[interval]*2+60000)throw new Error("Latest closed candle is stale ("+Math.round(ageMs/1000)+" seconds old).");
   return {venue,host:mainResult.host,symbol,interval,higherInterval:higher,candles,higherCandles,fetchedAt:new Date().toISOString(),lastClosedCandleTime:last.time,lastClosedCandleAgeMs:ageMs};
  }catch(e){failures.push(venue.toUpperCase()+": "+(e instanceof Error?e.message:String(e)));}
 }
 throw new Error("No exchange could provide fresh main and higher-timeframe data. "+failures.join(" | ").slice(0,1200));
}
function ema(values:number[],period:number):number[] {if(!values.length)return [];const k=2/(period+1),out=[values[0]];for(let i=1;i<values.length;i++)out.push(values[i]*k+out[i-1]*(1-k));return out;}
function trendSummary(candles:Candle[]) {
 const closes=candles.map(c=>c.close),e20=ema(closes,20),e50=ema(closes,50),i=closes.length-1;
 return {direction:closes[i]>e50[i]&&e20[i]>e50[i]?"BULLISH":closes[i]<e50[i]&&e20[i]<e50[i]?"BEARISH":"MIXED / NEUTRAL",lastClose:closes[i],ema20:e20[i],ema50:e50[i],lastClosedAt:new Date(candles[i].time).toISOString()};
}
function compactCandles(candles:Candle[],count:number) {return candles.slice(-count).map(c=>({utc:new Date(c.time).toISOString(),o:Number(c.open.toPrecision(7)),h:Number(c.high.toPrecision(7)),l:Number(c.low.toPrecision(7)),c:Number(c.close.toPrecision(7)),v:Number(c.volume.toPrecision(5))}));}
function parseBias(text:string) {const m=text.match(/^\s*(?:[-*]\s*)?(?:\*\*)?BIAS(?:\*\*)?\s*:\s*(LONG|SHORT|WAIT)\b/im),v=text.match(/^\s*(?:[-*]\s*)?(?:\*\*)?VETO(?:\*\*)?\s*:\s*(YES|NO)\b/im);return {bias:m?.[1]?.toUpperCase()||"WAIT",veto:v?.[1]?.toUpperCase()==="YES"};}
function specialistSystem(role:string) {
 const s=SPECIALISTS[role];
 return [
  "You are "+s.name+", one independent specialist among seven agents analyzing a live cryptocurrency perpetual-futures market. Your domain is "+s.focus+".",
  s.instruction,
  "Grounding rules:",
  "- You receive a server-fetched, timestamped snapshot of real historical exchange OHLCV candles and similar past chart situations with their subsequently observed outcomes. Use only this evidence. Do not invent live prices, candles, indicators, funding, order-book data, or examples.",
  "- All candles supplied are CLOSED. Examples are nearest historical analogues from earlier candles in the SAME symbol, timeframe and sample. Forward returns are observed outcomes, not guarantees or calibrated probabilities. Small samples are weak evidence.",
  "- Recommend WAIT when data conflict, analogue evidence is weak, or a setup is not confirmed. No forced trades; do not chase.",
  "- Do not promise profits or invent account size/leverage. This is paper-trading research, not live execution. State uncertainty and one strong counterargument.",
  "- Output under 160 words in exactly these labeled lines:",
  "BIAS: LONG or SHORT or WAIT",
  "VETO: YES or NO",
  "SETUP: one short phrase",
  "EVIDENCE: specific supplied candle/history evidence",
  "HISTORICAL: what similar cases did and sample limitations",
  "TRIGGER: objective condition before entry, or WAIT",
  "INVALIDATION: what proves the thesis wrong",
  "TARGET PLAN: risk-based target idea, or not applicable; do not fabricate exact prices",
  "COUNTERARGUMENT: strongest reason this setup can fail"
 ].join("\n");
}
async function executeAnalysis(request:Request, emit:(event:Record<string,unknown>)=>void=()=>{}) {
 const send=(event:Record<string,unknown>)=>{try{emit(event)}catch{}};
 send({type:"phase",phase:"validation",message:"Checking private access, symbol, timeframe and selected roles."});
 if(!process.env.TAROTAI_ACCESS_CODE)return jsonError("Private access is not configured.",503);
 if(!isAuthorized(request))return jsonError("Authentication required.",401);
 if(!process.env.OPENROUTER_API_KEY)return jsonError("AI specialist execution is unavailable: OPENROUTER_API_KEY is not configured for production.",503);
 let rawBody:string;try{rawBody=await request.text();}catch{return jsonError("Could not read request body.",400);}
 if(Buffer.byteLength(rawBody,"utf8")>12000)return jsonError("Request body exceeds 12 KB.",413);
 let body:any;try{body=JSON.parse(rawBody);}catch{return jsonError("Malformed JSON request body.",400);}
 const symbol=String(body?.symbol||"BTCUSDT").toUpperCase(),interval=String(body?.interval||"15m") as Interval,preferred=String(body?.venue||"binance").toLowerCase() as Venue;
 const roles=Array.isArray(body?.roles)?body.roles.map((v:any)=>String(v)):[];
 if(!/^[A-Z0-9]{4,20}$/.test(symbol))return jsonError("Invalid symbol.",400);
 if(!(ALLOWED_INTERVALS as readonly string[]).includes(interval))return jsonError("Unsupported timeframe.",400);
 if(!VENUE_ORDER.includes(preferred))return jsonError("Unsupported exchange.",400);
 if(roles.length<3||roles.length>7||new Set(roles).size!==roles.length||roles.some((r:string)=>!Object.hasOwn(SPECIALISTS,r)))return jsonError("Select 3–7 unique, supported specialist roles.",400);
 const model=String(process.env.OPENROUTER_MODEL||"openrouter/free").slice(0,160),started=Date.now();
 send({type:"phase",phase:"market",message:"Fetching fresh closed candles and checking the higher timeframe."});
 let market:any;try{market=await fetchVerifiedMarket(symbol,interval,preferred);}catch(e){return jsonError(e instanceof Error?e.message:"Verified market data unavailable.",502,{readOnly:true,orderPlacement:false});}
 const patternStudy=findSimilarCases(market.candles,interval,{horizon:6,maxExamples:8,maxDistance:0.34}),higherTrend=trendSummary(market.higherCandles),last=market.candles[market.candles.length-1];
 send({type:"phase",phase:"agents",symbol,interval,message:"Market snapshot verified. Dispatching selected independent specialists concurrently.",roles:roles.map((role:string)=>({role,name:SPECIALISTS[role].name,focus:SPECIALISTS[role].focus}))});
 const userContext={
  source:"server-fetched public exchange data",exchange:market.venue,host:market.host,symbol,interval,higherInterval:market.higherInterval,
  fetchedAt:market.fetchedAt,lastClosedCandleAgeSeconds:Math.max(0,Math.round(market.lastClosedCandleAgeMs/1000)),
  lastClosedCandle:{time:new Date(last.time).toISOString(),open:last.open,high:last.high,low:last.low,close:last.close,volume:last.volume},
  higherTimeframeSummary:higherTrend,
  historicalAnalogueStudy:{
   method:"Nearest feature matches among earlier closed candles from this symbol/timeframe; features are EMA spread, price-vs-EMA50, RSI, prior-range location, relative ATR, candle body/ATR and relative volume.",
   horizon:"six candles after each historical pattern",sampleCount:patternStudy.sampleCount,sideBias:patternStudy.sideBias,
   positiveSharePct:patternStudy.positiveSharePct,negativeSharePct:patternStudy.negativeSharePct,
   meanForwardReturnPct:patternStudy.averageReturnPct,medianForwardReturnPct:patternStudy.medianReturnPct,
   caveat:"descriptive analogue frequency, not a calibrated win probability; fees, spread, slippage and regime shifts can change results",
   currentPattern:patternStudy.current?.pattern||"unclassified",currentClose:patternStudy.current?.close??null,nearestExamples:patternStudy.examples.slice(0,6).map(e=>({closedAt:new Date(e.time).toISOString(),close:e.close,pattern:e.pattern,similarityPct:Number(e.similarityPct.toFixed(1)),observedForwardReturnPct:Number(e.forwardReturnPct.toFixed(3)),observedOutcome:e.outcome,horizonCandles:e.horizon}))
  },
  last24ClosedCandles:compactCandles(market.candles,24),last12HigherTimeframeCandles:compactCandles(market.higherCandles,12)
 };
 const serialized=JSON.stringify(userContext);
 const results=await Promise.all(roles.map(async (role: string)=>{
  const agentStarted=Date.now();
  send({type:"agent",role,status:"running",name:SPECIALISTS[role].name,focus:SPECIALISTS[role].focus});
  try {
   const response=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",cache:"no-store",signal:AbortSignal.timeout(16000),
    headers:{"Authorization":"Bearer "+process.env.OPENROUTER_API_KEY,"Content-Type":"application/json","HTTP-Referer":"https://tarotai-core.vercel.app","X-Title":"TarotAI Live Specialist Team"},
    body:JSON.stringify({model,messages:[{role:"system",content:specialistSystem(role)},{role:"user",content:"Independently analyze this verified live chart snapshot and historical analogue evidence. Return the exact labeled format requested. Do not assume entry is valid because other specialists may agree.\n\n"+serialized}],temperature:0.15,max_tokens:650})});
   const text=await response.text();let data:any;try{data=JSON.parse(text);}catch{throw new Error("AI provider returned invalid JSON.");}
   if(!response.ok)throw new Error(String(data?.error?.message||data?.message||"AI provider HTTP "+response.status).slice(0,400));
   const report=data?.choices?.[0]?.message?.content;if(typeof report!=="string"||!report.trim())throw new Error("AI provider returned no specialist analysis.");
   const result={role,name:SPECIALISTS[role].name,ok:true,...parseBias(report),text:report.trim().slice(0,6000),elapsedMs:Date.now()-agentStarted,model};
   send({type:"agent",role,status:"complete",result});
   return result;
  }catch(e){const result={role,name:SPECIALISTS[role].name,ok:false,bias:"WAIT",veto:role==="risk",text:"This specialist did not return a verified analysis: "+(e instanceof Error?e.message:"provider error"),elapsedMs:Date.now()-agentStarted,model};send({type:"agent",role,status:"error",result});return result;}
 }));
 const ok=results.filter(r=>r.ok).length;
 if(!ok)return jsonError("No AI specialists returned a valid analysis. Check model/provider configuration and retry.",502,{results,model,elapsedMs:Date.now()-started});
 return NextResponse.json({ok:true,mode:"parallel-llm-specialists",model,elapsedMs:Date.now()-started,
  market:{venue:market.venue,host:market.host,symbol,interval,higherInterval:market.higherInterval,fetchedAt:market.fetchedAt,
   lastClosedCandleTime:new Date(market.lastClosedCandleTime).toISOString(),lastClosedCandleAgeSeconds:Math.max(0,Math.round(market.lastClosedCandleAgeMs/1000)),higherTimeframeTrend:higherTrend.direction},
  historicalAnalogueStudy:userContext.historicalAnalogueStudy,results,completedAgents:ok,requestedAgents:results.length,
  safety:{readOnly:true,orderPlacement:false,paperTradingOnly:true}
 },{headers:{"Cache-Control":"no-store"}});
}

export async function POST(request:Request) {
 if(!request.headers.get("accept")?.includes("text/event-stream"))return executeAnalysis(request);
 const encoder=new TextEncoder();
 const stream=new ReadableStream<Uint8Array>({
  start(controller) {
   const send=(event:Record<string,unknown>)=>{try{controller.enqueue(encoder.encode("data: "+JSON.stringify(event)+"\n\n"))}catch{}};
   void (async()=>{
    try {
     const response=await executeAnalysis(request,send);
     const data=await response.clone().json().catch(()=>({error:"Invalid response from trading agent endpoint."}));
     send({type:response.ok?"complete":"failure",status:response.status,data});
    } catch(error) {
     send({type:"failure",status:500,data:{error:error instanceof Error?error.message:"Trading agent execution failed."}});
    } finally {
     try{controller.close()}catch{}
    }
   })();
  }
 });
 return new Response(stream,{status:200,headers:{"Content-Type":"text/event-stream; charset=utf-8","Cache-Control":"no-cache, no-transform","Connection":"keep-alive","X-Accel-Buffering":"no"}});
}
