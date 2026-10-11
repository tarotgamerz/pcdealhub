import { NextResponse } from "next/server";
import { isAuthorized } from "../../../../lib/auth";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const intervals:Record<string,Record<string,string>>={
 binance:{"1m":"1m","3m":"3m","5m":"5m","15m":"15m","30m":"30m","1h":"1h","2h":"2h","4h":"4h","1d":"1d"},
 bybit:{"1m":"1","3m":"3","5m":"5","15m":"15","30m":"30","1h":"60","2h":"120","4h":"240","1d":"D"},
 okx:{"1m":"1m","3m":"3m","5m":"5m","15m":"15m","30m":"30m","1h":"1H","2h":"2H","4h":"4H","1d":"1D"}
};
export async function GET(req:Request){
 if(!process.env.TAROTAI_ACCESS_CODE)return NextResponse.json({error:"Private access is not configured"},{status:503});
 if(!isAuthorized(req))return NextResponse.json({error:"Authentication required"},{status:401});
 const q=new URL(req.url).searchParams,venue=(q.get("venue")||"binance").toLowerCase(),symbol=(q.get("symbol")||"BTCUSDT").toUpperCase(),interval=q.get("interval")||"1m",limit=Math.min(500,Math.max(20,Math.floor(Number(q.get("limit")||100))));
 if(!intervals[venue]||!intervals[venue][interval]||!/^[A-Z0-9]{4,20}$/.test(symbol))return NextResponse.json({error:"Unsupported venue, symbol format or interval"},{status:400});
 let url:URL,normalize:(x:any)=>any;
 if(venue==="binance"){url=new URL("https://fapi.binance.com/fapi/v1/klines");url.searchParams.set("symbol",symbol);url.searchParams.set("interval",intervals.binance[interval]);url.searchParams.set("limit",String(limit));normalize=(x:any)=>({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5],closeTime:+x[6]});}
 else if(venue==="bybit"){url=new URL("https://api.bybit.com/v5/market/kline");url.searchParams.set("category","linear");url.searchParams.set("symbol",symbol);url.searchParams.set("interval",intervals.bybit[interval]);url.searchParams.set("limit",String(limit));normalize=(x:any)=>({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5]});}
 else {const inst=symbol.endsWith("USDT")?symbol.slice(0,-4)+"-USDT-SWAP":symbol;url=new URL("https://www.okx.com/api/v5/market/candles");url.searchParams.set("instId",inst);url.searchParams.set("bar",intervals.okx[interval]);url.searchParams.set("limit",String(limit));normalize=(x:any)=>({time:+x[0],open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5],confirmed:x[8]==="1"});}
 try{
  const r=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(8000)}),raw=await r.json();
  if(!r.ok)return NextResponse.json({error:"Exchange HTTP error",venue,detail:raw?.msg||raw?.retMsg||raw?.message||"upstream error"},{status:502});
  let rows:any[]=venue==="binance"?(Array.isArray(raw)?raw:[]):venue==="bybit"?(raw?.retCode===0&&Array.isArray(raw?.result?.list)?raw.result.list:[]):(raw?.code==="0"&&Array.isArray(raw?.data)?raw.data:[]);
  if(venue!=="binance")rows=rows.slice().reverse();
  const candles=rows.map(normalize);
  if(!candles.length||candles.some(c=>![c.time,c.open,c.high,c.low,c.close].every(Number.isFinite)||c.high<c.low||c.low<=0||c.close<=0)||candles.some((c,i)=>i>0&&c.time<=candles[i-1].time))return NextResponse.json({error:"Exchange returned no valid candles",venue,detail:raw?.retMsg||raw?.msg||raw?.code},{status:502});
  const last=candles[candles.length-1],ageMs=Date.now()-last.time;
  const intervalMs:Record<string,number>={"1m":60000,"3m":180000,"5m":300000,"15m":900000,"30m":1800000,"1h":3600000,"2h":7200000,"4h":14400000,"1d":86400000};
  const stale=ageMs>intervalMs[interval]+60000;
  return NextResponse.json({venue,symbol,interval,fetchedAt:new Date().toISOString(),lastCandleAgeMs:ageMs,dataAgeMs:ageMs,marketDataMode:"live-public-read-only",stale,candles,readOnly:true,orderPlacement:false},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Exchange market-data request timed out",venue},{status:502});}
}