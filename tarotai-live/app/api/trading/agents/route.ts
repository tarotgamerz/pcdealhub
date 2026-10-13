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
 macro:{name:"Macro-Econometrician · Committee Chair",focus:"empirical macroeconomics, liquidity, central-bank policy and regime constraints",instruction:"Set the committee regime and capital ceiling. The request contains crypto OHLCV and a higher-timeframe summary, not live rates, yield curves, central-bank releases or geopolitical feeds. State those macro inputs are UNAVAILABLE; use price regime only as a provisional proxy, never claim to have observed macro data. Set gross paper exposure ceilings from fixed framework guardrails: risk-on proxy 25%, neutral 10%, risk-off proxy 5% of paper equity. These are conservative caps, not optimized sizing. LONG only if both chart and higher timeframe support a clean risk-on proxy; SHORT only for a clean risk-off proxy; otherwise WAIT."},
 alpha:{name:"Quantitative Alpha Strategist",focus:"mathematical finance, statistical arbitrage and multi-factor anomaly research",instruction:"Form a falsifiable setup using closed-candle structure, EMA/RSI/ATR and supplied historical analogues. State the trigger formula and invalidation condition in plain terms. Historical analogues are descriptive, not a calibrated win probability. Do not claim cross-asset cointegration without those data."},
 sentiment:{name:"Alternative Data & Sentiment Miner",focus:"NLP, computational social science and alternative-data signals",instruction:"Look for recent news/social/corporate or supply-chain sentiment only if actually supplied. This endpoint does not ingest headlines, satellite images, shipping manifests or social streams: explicitly mark external sentiment UNAVAILABLE and do not invent it. Use OHLCV volume/candle behavior only as a participation proxy; if that proxy is inconclusive, vote WAIT."},
 microstructure:{name:"Microstructure & Order Book Analyst",focus:"limit order books, order-flow toxicity, volume profile and execution liquidity",instruction:"Assess supplied candle ranges and volume participation as limited proxies only. Live Level-2 order book, trade-level VPIN, dark-pool prints, spread and venue depth are not supplied; mark them UNAVAILABLE and never claim direct observation. Vote direction only if candle/volume evidence is unusually clear; otherwise WAIT."},
 volatility:{name:"Volatility & Options Structurer",focus:"stochastic volatility, ATR, range expansion and derivative risk",instruction:"Use ATR expansion/compression, candle ranges and historical volatility proxies to assess disorder and stop feasibility. Implied-volatility smiles, options term structure and variance-swap quotes are not supplied; explicitly mark them UNAVAILABLE. Veto disorderly volatility or stops inside ordinary noise."},
 risk:{name:"Adversarial Risk & Portfolio Optimizer",focus:"extreme-value risk, stress scenarios, fractional Kelly and portfolio constraints",instruction:"Act as the internal skeptic. Try to falsify the proposed direction; inspect historical evidence limits, stop/target geometry, volatility, costs and failure paths. Set VETO: YES if there is no independently qualified chart setup, if the setup is weak, or if the stop/target is invalid. Never invent account equity, leverage or VaR inputs."},
 execution:{name:"Institutional Execution & Routing Agent",focus:"algorithmic execution, implementation shortfall and venue routing",instruction:"Translate only an independently qualified setup into a PAPER execution plan. The endpoint does not provide live spread, Level-2 depth, fee tier or latency, so do not claim measured implementation shortfall or choose a real venue route. Recommend cautious paper limit/TWAP-style slicing only when the chart setup and risk geometry are valid; otherwise WAIT. Never submit orders."}
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
  "- Recommend WAIT if evidence conflicts, the sample is weak, or a setup is unconfirmed. Never force a trade.",
  "- Paper-trading research only. Never promise profits or invent prices, account size, leverage, or indicators.",
  "- Do not reveal private reasoning. Output the concise final report only, at most 90 words total.",
  "- Use exactly these 7 short lines; each descriptive line must be one short sentence:",
  "BIAS: LONG or SHORT or WAIT",
  "VETO: YES or NO",
    "EVIDENCE: specific supplied candle/history evidence",
  "HISTORICAL: observed analogue result and sample size, or say evidence is weak",
  "TRIGGER: objective condition before entry, or WAIT",
  "INVALIDATION: what proves the thesis wrong",
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
 if(roles.length!==7||new Set(roles).size!==7||roles.some((r:string)=>!Object.hasOwn(SPECIALISTS,r))||Object.keys(SPECIALISTS).some((r:string)=>!roles.includes(r)))return jsonError("The full seven-agent committee must be selected exactly once: macro, alpha, sentiment, microstructure, volatility, risk and execution.",400);
 const model=String(process.env.OPENROUTER_MODEL||"qwen/qwen3-next-80b-a3b-instruct:free").slice(0,160),started=Date.now();
 send({type:"phase",phase:"market",message:"Fetching fresh closed candles and checking the higher timeframe."});
 let market:any;try{market=await fetchVerifiedMarket(symbol,interval,preferred);}catch(e){return jsonError(e instanceof Error?e.message:"Verified market data unavailable.",502,{readOnly:true,orderPlacement:false});}
 const patternStudy=findSimilarCases(market.candles,interval,{horizon:6,maxExamples:8,maxDistance:0.34}),higherTrend=trendSummary(market.higherCandles),last=market.candles[market.candles.length-1];
 send({type:"phase",phase:"agents",symbol,interval,message:"Market snapshot verified. Dispatching selected independent specialists concurrently.",roles:roles.map((role:string)=>({role,name:SPECIALISTS[role].name,focus:SPECIALISTS[role].focus}))});
 const userContext={
  source:"server-fetched public exchange data",availableFeeds:{closedOHLCV:true,higherTimeframeCandles:true,historicalAnalogues:true,liveMacroRates:false,centralBankCalendar:false,geopoliticalFeed:false,newsAndSocialSentiment:false,satelliteOrShippingData:false,level2OrderBook:false,tradeLevelVPIN:false,darkPoolData:false,optionsImpliedVolatilitySurface:false,liveSpreadAndVenueDepth:false},committeeGuardrails:{riskOnProxyMaxGrossExposurePct:25,neutralMaxGrossExposurePct:10,riskOffProxyMaxGrossExposurePct:5,description:"Fixed conservative paper-research caps; not optimized or a personalized allocation recommendation."},exchange:market.venue,host:market.host,symbol,interval,higherInterval:market.higherInterval,
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
   const response=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",cache:"no-store",signal:AbortSignal.timeout(23000),
    headers:{"Authorization":"Bearer "+process.env.OPENROUTER_API_KEY,"Content-Type":"application/json","HTTP-Referer":"https://tarotai-core.vercel.app","X-Title":"TarotAI Live Specialist Team"},
    body:JSON.stringify({model,messages:[{role:"system",content:specialistSystem(role)},{role:"user",content:"Independently analyze this verified closed-candle snapshot. Follow the concise 7-line report format exactly; do not repeat the prompt and do not assume other agents agree.\n\n"+serialized}],temperature:0.1,max_tokens:1200,models:["meta-llama/llama-3.3-8b-instruct:free","qwen/qwen3-235b-a22b-07-25:free"]})});
   const text=await response.text();let data:any;try{data=JSON.parse(text);}catch{throw new Error("OpenRouter HTTP "+response.status+" returned a non-JSON response.");}
   if(!response.ok||data?.error){const providerError=data?.error||{};const status=Number(response.status)||Number(providerError.code)||0;const code=typeof providerError.code==="string"?providerError.code:"";const kind=typeof data?.error_type==="string"?data.error_type:"";const message=String(providerError.message||data?.message||"Provider returned an unspecified error").replace(/sk-or-v1-[A-Za-z0-9_-]+/g,"[redacted key]").slice(0,280);throw new Error("OpenRouter HTTP "+status+(code?" · "+code:"")+(kind?" · "+kind:"")+": "+message);}
   const report=data?.choices?.[0]?.message?.content;if(typeof report!=="string"||!report.trim()){const reason=data?.choices?.[0]?.finish_reason;const usage=data?.usage||{};const reasoningTokens=usage?.completion_tokens_details?.reasoning_tokens;const completionTokens=usage?.completion_tokens;const routedModel=typeof data?.model==="string"?data.model:model;throw new Error("OpenRouter returned no visible report"+(reason?" (finish_reason: "+String(reason)+")":"")+(Number.isFinite(Number(completionTokens))?"; completion tokens: "+Number(completionTokens):"")+(Number.isFinite(Number(reasoningTokens))?"; reasoning tokens: "+Number(reasoningTokens):"")+"; routed model: "+routedModel+". Output budget was increased; check provider availability or free-tier rate limits if this persists.");}
   const result={role,name:SPECIALISTS[role].name,ok:true,...parseBias(report),text:report.trim().slice(0,6000),elapsedMs:Date.now()-agentStarted,model:typeof data?.model==="string"?data.model:model};
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
 return new Response(stream,{status:200,headers:{"Content-Type":"text/event-stream; charset=utf-8","Cache-Control":"no-cache, no-transform","X-Accel-Buffering":"no"}});
}
