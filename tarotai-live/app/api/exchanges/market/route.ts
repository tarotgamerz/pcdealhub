import { NextResponse } from "next/server";
import { isAuthorized } from "../../../../lib/auth";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const intervals:Record<string,Record<string,string>>={
 binance:{"1m":"1m","3m":"3m","5m":"5m","15m":"15m","30m":"30m","1h":"1h","2h":"2h","4h":"4h","1d":"1d"},
 bybit:{"1m":"1","3m":"3","5m":"5","15m":"15","30m":"30","1h":"60","2h":"120","4h":"240","1d":"D"},
 okx:{"1m":"1m","3m":"3m","5m":"5m","15m":"15m","30m":"30m","1h":"1H","2h":"2H","4h":"4H","1d":"1D"}
};

const YAHOO_MARKETS:Record<string,{providerSymbol:string;name:string;currency:string;unit:string}> = {
 NIFTY50:{providerSymbol:"^NSEI",name:"NIFTY 50",currency:"INR",unit:"index points"},
 GOLD:{providerSymbol:"GC=F",name:"Gold Futures (COMEX)",currency:"USD",unit:"USD per troy ounce"}
};
const YAHOO_INTERVALS:Record<string,string> = {"1m":"1m","5m":"5m","15m":"15m","30m":"30m","1h":"60m","2h":"60m","4h":"60m","1d":"1d"};
const DURATIONS:Record<string,number> = {"1m":60000,"3m":180000,"5m":300000,"15m":900000,"30m":1800000,"1h":3600000,"2h":7200000,"4h":14400000,"1d":86400000};
const YAHOO_RANGES:Record<string,string> = {"1m":"5d","5m":"5d","15m":"1mo","30m":"1mo","1h":"3mo","2h":"6mo","4h":"6mo","1d":"2y"};
const YAHOO_HISTORY_MS:Record<string,number> = {"1m":7*86400000,"5m":14*86400000,"15m":45*86400000,"30m":45*86400000,"1h":180*86400000,"2h":240*86400000,"4h":240*86400000,"1d":730*86400000};
function aggregateYahooCandles(rows:any[],interval:string,sourceDuration:number) {
 const targetDuration=DURATIONS[interval]||sourceDuration;
 if(targetDuration===sourceDuration)return rows;
 const groups=new Map<number,any>();
 for(const bar of rows){
  const bucket=Math.floor(bar.time/targetDuration)*targetDuration;
  const current=groups.get(bucket);
  if(!current)groups.set(bucket,{...bar,time:bucket,closeTime:bar.closeTime,volume:Number(bar.volume)||0});
  else {current.high=Math.max(current.high,bar.high);current.low=Math.min(current.low,bar.low);current.close=bar.close;current.closeTime=bar.closeTime;current.volume+=(Number(bar.volume)||0);}
 }
 return [...groups.values()].sort((a,b)=>a.time-b.time).map(bar=>({...bar,closeTime:Math.max(bar.time,Math.min(bar.closeTime,bar.time+targetDuration-1))}));
}
function yahooMarketIsOpen(meta:any,now=Date.now()) {
 const state=String(meta?.marketState||"").toUpperCase();
 if(["REGULAR","OPEN"].includes(state))return true;
 if(["CLOSED","POST","POSTPOST","PRE","PREPRE"].includes(state))return false;
 const regular=meta?.currentTradingPeriod?.regular,start=Number(regular?.start),end=Number(regular?.end),nowSeconds=now/1000;
 if(Number.isFinite(start)&&Number.isFinite(end)&&end>start)return nowSeconds>=start&&nowSeconds<=end;
 const lastTime=Number(meta?.regularMarketTime)*1000;
 return Number.isFinite(lastTime)&&lastTime>0&&now-lastTime>=0&&now-lastTime<20*60*1000;
}
async function yahooMarketData(symbol:string,interval:string,limit:number,before:number|null) {
 const market=YAHOO_MARKETS[symbol];
 if(!market||!Object.hasOwn(YAHOO_INTERVALS,interval))throw new Error("Unsupported Yahoo reference market or timeframe.");
 const sourceInterval=YAHOO_INTERVALS[interval],sourceDuration=sourceInterval==="60m"?3600000:sourceInterval==="1d"?86400000:Math.max(60000,Number(sourceInterval.replace("m",""))*60000);
 const url=new URL("https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(market.providerSymbol));
 url.searchParams.set("interval",sourceInterval);url.searchParams.set("includePrePost","false");url.searchParams.set("events","div,splits");
 if(before!==null){url.searchParams.set("period1",String(Math.max(0,Math.floor((before-(YAHOO_HISTORY_MS[interval]||14*86400000))/1000))));url.searchParams.set("period2",String(Math.max(1,Math.floor(before/1000)-1)));}
 else url.searchParams.set("range",YAHOO_RANGES[interval]||"5d");
 let result:any=null,sourceHost="",lastError="Yahoo Finance returned no chart data.";
 for(const host of ["query1.finance.yahoo.com","query2.finance.yahoo.com"]){
  try{
   const candidate=new URL(url.toString());candidate.host=host;
   const response=await fetch(candidate,{cache:"no-store",signal:AbortSignal.timeout(4500),headers:{"Accept":"application/json","User-Agent":"Mozilla/5.0 TarotAI read-only market dashboard"}});
   const payload=await response.json().catch(()=>null),entry=payload?.chart?.result?.[0];
   if(response.ok&&entry&&Array.isArray(entry.timestamp)){result=entry;sourceHost=host;break;}
   lastError=String(payload?.chart?.error?.description||"Yahoo Finance chart request failed (HTTP "+response.status+").");
  }catch(error){lastError=error instanceof Error?error.message:"Yahoo Finance request failed.";}
 }
 if(!result)throw new Error(lastError);
 const timestamps=result.timestamp||[],quote=result.indicators?.quote?.[0]||{};
 let candles=timestamps.map((stamp:number,i:number)=>{
  const time=Number(stamp)*1000,open=Number(quote.open?.[i]),high=Number(quote.high?.[i]),low=Number(quote.low?.[i]),close=Number(quote.close?.[i]),volume=Number(quote.volume?.[i]??0);
  return {time,open,high,low,close,volume:Number.isFinite(volume)&&volume>=0?volume:0,closeTime:time+sourceDuration-1};
 }).filter((c:any)=>[c.time,c.open,c.high,c.low,c.close,c.volume,c.closeTime].every(Number.isFinite)&&c.time>0&&c.open>0&&c.high>=Math.max(c.open,c.close,c.low)&&c.low<=Math.min(c.open,c.close,c.high)&&c.low>0&&c.close>0&&(before===null||c.time<before));
 candles=aggregateYahooCandles(candles,interval,sourceDuration);
 if(!candles.length)throw new Error("Yahoo Finance returned no valid candles for "+market.name+".");
 if(candles.some((c:any,i:number)=>i>0&&c.time<=candles[i-1].time))throw new Error("Yahoo Finance candles were not in chronological order.");
 candles=candles.slice(-limit);
 const now=Date.now(),latest=candles[candles.length-1],closed=candles.filter((c:any)=>c.closeTime<now-300),lastClosed=closed[closed.length-1];
 const candleAgeMs=lastClosed?Math.max(0,now-lastClosed.closeTime):Number.POSITIVE_INFINITY;
 const quoteTime=Number(result.meta?.regularMarketTime)*1000;
 const quoteAgeMs=Number.isFinite(quoteTime)&&quoteTime>0?Math.max(0,now-quoteTime):candleAgeMs;
 const marketOpen=yahooMarketIsOpen(result.meta,now);
 const freshnessAgeMs=interval==="1d"?quoteAgeMs:candleAgeMs;const freshnessLimitMs=interval==="1d"?25*60*1000:25*60*1000+Math.max(0,(DURATIONS[interval]||60000)-15*60*1000);const stale=marketOpen&&(!Number.isFinite(freshnessAgeMs)||freshnessAgeMs>freshnessLimitMs);
 return {venue:"yahoo",symbol,providerSymbol:market.providerSymbol,assetName:market.name,currency:String(result.meta?.currency||market.currency),unit:market.unit,interval,fetchedAt:new Date(now).toISOString(),sourceHost,marketOpen,marketState:String(result.meta?.marketState|| (marketOpen?"OPEN":"CLOSED")),delayed:true,quoteTimestamp:Number.isFinite(quoteTime)&&quoteTime>0?quoteTime:null,quoteAgeMs,candleAgeMs,latestClosedCandleTime:lastClosed?.time??null,latestCandleTime:latest.time,latestCandleInProgress:latest.closeTime>=now-300,closedCandleCount:closed.length,marketDataMode:"delayed-reference-read-only",stale:before!==null?false:stale,historyPage:before!==null,candles,readOnly:true,orderPlacement:false,warning:"Yahoo Finance data may be delayed. NIFTY 50 and Gold are reference-only in TarotAI; paper orders and automated execution are disabled for these markets."};
}

export async function GET(req:Request){
 const q=new URL(req.url).searchParams;
 const publicReadOnly=q.get("public")==="1";
 if(!publicReadOnly){
  if(!process.env.TAROTAI_ACCESS_CODE)return NextResponse.json({error:"Private access is not configured"},{status:503});
  if(!isAuthorized(req))return NextResponse.json({error:"Authentication required"},{status:401});
 }
 const venue=(q.get("venue")||"binance").toLowerCase(),symbol=(q.get("symbol")||"BTCUSDT").toUpperCase(),interval=q.get("interval")||"1m",limit=Math.min(500,Math.max(20,Math.floor(Number(q.get("limit")||100))));
 const beforeRaw=q.get("before"),before=beforeRaw===null?null:Number(beforeRaw);
 if(beforeRaw!==null&&(before===null||!Number.isFinite(before)||before<=0))return NextResponse.json({error:"Invalid historical candle cursor"},{status:400});
 const historyPage=before!==null;

 if(venue==="yahoo"){
  if(!YAHOO_MARKETS[symbol]||!Object.hasOwn(YAHOO_INTERVALS,interval))return NextResponse.json({error:"Unsupported Yahoo reference market or interval",readOnly:true,orderPlacement:false},{status:400,headers:{"Cache-Control":"no-store"}});
  try{
   const data=await yahooMarketData(symbol,interval,limit,before);
   return NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});
  }catch(error){return NextResponse.json({error:"Yahoo Finance reference data unavailable",detail:error instanceof Error?error.message:"Unknown Yahoo Finance error",venue,symbol,interval,readOnly:true,orderPlacement:false},{status:502,headers:{"Cache-Control":"no-store"}});}
 }
 if(!intervals[venue]||!intervals[venue][interval]||!/^[A-Z0-9]{4,20}$/.test(symbol))return NextResponse.json({error:"Unsupported venue, symbol format or interval"},{status:400});
 let url:URL,normalize:(x:any)=>any;
 if(venue==="binance"){url=new URL("https://fapi.binance.com/fapi/v1/klines");url.searchParams.set("symbol",symbol);url.searchParams.set("interval",intervals.binance[interval]);url.searchParams.set("limit",String(limit));if(before!==null)url.searchParams.set("endTime",String(Math.floor(before)-1));normalize=(x:any)=>({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5],closeTime:+x[6]});}
 else if(venue==="bybit"){url=new URL("https://api.bybit.com/v5/market/kline");url.searchParams.set("category","linear");url.searchParams.set("symbol",symbol);url.searchParams.set("interval",intervals.bybit[interval]);url.searchParams.set("limit",String(limit));if(before!==null)url.searchParams.set("end",String(Math.floor(before)-1));normalize=(x:any)=>({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5]});}
 else {const inst=symbol.endsWith("USDT")?symbol.slice(0,-4)+"-USDT-SWAP":symbol;url=new URL(before===null?"https://www.okx.com/api/v5/market/candles":"https://www.okx.com/api/v5/market/history-candles");url.searchParams.set("instId",inst);url.searchParams.set("bar",intervals.okx[interval]);url.searchParams.set("limit",String(before===null?Math.min(limit,300):Math.min(limit,100)));if(before!==null)url.searchParams.set("after",String(Math.floor(before)));normalize=(x:any)=>({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5],confirmed:x[8]==="1"});}
 try{
  // Binance Futures has documented alternate API hosts. Try each in turn because
  // regional routing or a transient edge failure can affect one host only.
  const urls:URL[] = venue==="binance"
    ? ["fapi.binance.com","fapi1.binance.com","fapi2.binance.com","fapi3.binance.com"].map(host=>{const u=new URL(url.toString());u.host=host;return u;})
    : [url];
  let raw:any=null, lastHttpStatus=0, lastDetail="upstream error", sourceHost="";
  for(const candidate of urls){
    try{
      const response=await fetch(candidate,{cache:"no-store",signal:AbortSignal.timeout(1800)});
      const payload=await response.json().catch(()=>null);
      if(response.ok){raw=payload;sourceHost=candidate.host;break;}
      lastHttpStatus=response.status;
      lastDetail=payload?.msg||payload?.retMsg||payload?.message||("HTTP "+response.status);
    }catch(error){
      lastDetail=error instanceof Error?error.message:"exchange request failed";
    }
  }
  if(raw===null)return NextResponse.json({error:"Exchange HTTP error",venue,symbol,interval,detail:lastDetail,httpStatus:lastHttpStatus||null,hostsTried:urls.map(u=>u.host),readOnly:true,orderPlacement:false},{status:502});
  let rows:any[]=venue==="binance"?(Array.isArray(raw)?raw:[]):venue==="bybit"?(raw?.retCode===0&&Array.isArray(raw?.result?.list)?raw.result.list:[]):(raw?.code==="0"&&Array.isArray(raw?.data)?raw.data:[]);
  if(venue!=="binance")rows=rows.slice().reverse();
  let candles=rows.map(normalize).filter(c=>before===null||c.time<before);
  if(!candles.length||candles.some(c=>![c.time,c.open,c.high,c.low,c.close].every(Number.isFinite)||c.high<c.low||c.low<=0||c.close<=0)||candles.some((c,i)=>i>0&&c.time<=candles[i-1].time))return NextResponse.json({error:"Exchange returned no valid candles",venue,detail:raw?.retMsg||raw?.msg||raw?.code},{status:502});
  const last=candles[candles.length-1];
  const intervalMs:Record<string,number>={"1m":60000,"3m":180000,"5m":300000,"15m":900000,"30m":1800000,"1h":3600000,"2h":7200000,"4h":14400000,"1d":86400000};
  const now=Date.now(),duration=intervalMs[interval];
  const candleEnd=(c:any)=>Number.isFinite(c.closeTime)&&c.closeTime>c.time?c.closeTime:Number(c.time)+duration-1;
  const closedCandles=candles.filter(c=>candleEnd(c)<now-300);
  const latestClosed=closedCandles[closedCandles.length-1];
  const ageMs=latestClosed?Math.max(0,now-candleEnd(latestClosed)):Number.POSITIVE_INFINITY;
  const stale=!Number.isFinite(ageMs)||ageMs>duration+60000;
  const latestCandleInProgress=candleEnd(last)>=now-300;
  return NextResponse.json({venue,symbol,interval,fetchedAt:new Date().toISOString(),sourceHost,lastCandleAgeMs:ageMs,dataAgeMs:ageMs,latestClosedCandleTime:latestClosed?.time??null,latestCandleTime:last.time,latestCandleInProgress,closedCandleCount:closedCandles.length,marketDataMode:"live-public-read-only",stale:historyPage?false:stale,historyPage,candles,readOnly:true,orderPlacement:false},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Exchange market-data request timed out",venue},{status:502});}
}