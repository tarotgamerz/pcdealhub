import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED = new Set(["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT"]);
const YAHOO_MARKETS:Record<string,{providerSymbol:string;name:string;currency:string;unit:string}> = {
  NIFTY50:{providerSymbol:"^NSEI",name:"NIFTY 50",currency:"INR",unit:"index points"},
  GOLD:{providerSymbol:"GC=F",name:"Gold Futures (COMEX)",currency:"USD",unit:"USD per troy ounce"}
};
function marketIsOpen(meta:any,now=Date.now()) {
  const state=String(meta?.marketState||"").toUpperCase();
  if(["REGULAR","OPEN"].includes(state))return true;
  if(["CLOSED","POST","POSTPOST","PRE","PREPRE"].includes(state))return false;
  const regular=meta?.currentTradingPeriod?.regular,start=Number(regular?.start),end=Number(regular?.end);
  if(Number.isFinite(start)&&Number.isFinite(end)&&end>start)return now/1000>=start&&now/1000<=end;
  const timestamp=Number(meta?.regularMarketTime)*1000;
  return Number.isFinite(timestamp)&&timestamp>0&&now-timestamp>=0&&now-timestamp<20*60*1000;
}

function spreadMetrics(bidInput: unknown, askInput: unknown) {
  const bid = Number(bidInput), ask = Number(askInput);
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask < bid) {
    return { bid: null, ask: null, spreadBps: null };
  }
  const mid = (bid + ask) / 2;
  return { bid, ask, spreadBps: mid > 0 ? ((ask - bid) / mid) * 10000 : null };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const venue = (url.searchParams.get("venue") || "binance").toLowerCase();
  const symbol = (url.searchParams.get("symbol") || "BTCUSDT").toUpperCase();

  if (!["okx", "binance", "yahoo"].includes(venue) || (venue !== "yahoo" && !SUPPORTED.has(symbol))) {
    return NextResponse.json(
      { error: "Unsupported live quote venue or symbol.", readOnly: true, orderPlacement: false },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }


  if (venue === "yahoo") {
    const market=YAHOO_MARKETS[symbol];
    if(!market)return NextResponse.json({error:"Unsupported Yahoo reference market.",readOnly:true,orderPlacement:false},{status:400,headers:{"Cache-Control":"no-store"}});
    let result:any=null,lastError="Yahoo Finance quote unavailable.";
    for(const host of ["query1.finance.yahoo.com","query2.finance.yahoo.com"]){
      try{
        const endpoint="https://"+host+"/v8/finance/chart/"+encodeURIComponent(market.providerSymbol)+"?interval=1m&range=1d&includePrePost=false";
        const response=await fetch(endpoint,{cache:"no-store",signal:AbortSignal.timeout(3500),headers:{"Accept":"application/json","User-Agent":"Mozilla/5.0 TarotAI read-only market dashboard"}});
        const payload=await response.json().catch(()=>null),entry=payload?.chart?.result?.[0];
        if(response.ok&&entry){result=entry;break;}
        lastError=String(payload?.chart?.error?.description||"Yahoo Finance chart request failed (HTTP "+response.status+").");
      }catch(error){lastError=error instanceof Error?error.message:"Yahoo Finance request failed.";}
    }
    if(!result)return NextResponse.json({error:"Yahoo Finance reference quote unavailable.",detail:lastError,venue,symbol,readOnly:true,orderPlacement:false},{status:502,headers:{"Cache-Control":"no-store"}});
    const meta=result.meta||{},timestamps=Array.isArray(result.timestamp)?result.timestamp:[],lastIndex=timestamps.length-1;
    const timestamp=Number(meta.regularMarketTime)*1000||Number(timestamps[lastIndex])*1000;
    const price=Number(meta.regularMarketPrice)||Number(result.indicators?.quote?.[0]?.close?.[lastIndex]);
    const now=Date.now(),ageMs=Number.isFinite(timestamp)&&timestamp>0?Math.max(0,now-timestamp):Number.POSITIVE_INFINITY;
    const open=marketIsOpen(meta,now),stale=!Number.isFinite(ageMs)||(open&&ageMs>25*60*1000);
    if(!Number.isFinite(price)||price<=0||!Number.isFinite(timestamp)||timestamp<=0){
      return NextResponse.json({error:"Yahoo Finance returned an invalid reference price.",venue,symbol,readOnly:true,orderPlacement:false},{status:502,headers:{"Cache-Control":"no-store"}});
    }
    return NextResponse.json({ok:true,venue:"yahoo",symbol,providerSymbol:market.providerSymbol,assetName:market.name,currency:String(meta.currency||market.currency),unit:market.unit,price,priceBasis:"Yahoo Finance delayed reference price",bid:null,ask:null,spreadBps:null,spreadAvailable:false,timestamp,ageMs,source:"yahoo-finance-delayed-reference",marketOpen:open,delayed:true,stale,readOnly:true,orderPlacement:false,warning:"Reference-only feed. Quote may be delayed and has no verified executable bid/ask; TarotAI blocks paper entries for NIFTY 50 and Gold."},{headers:{"Cache-Control":"no-store"}});
  }

  if (venue === "binance") {
    try {
      // One order-book ticker provides bid, ask and exchange event time from
      // the same snapshot. The midpoint is intentionally labeled, not called last trade.
      const response = await fetch("https://fapi.binance.com/fapi/v1/ticker/bookTicker?symbol=" + encodeURIComponent(symbol), { cache: "no-store", signal: AbortSignal.timeout(2500) });
      const payload = await response.json().catch(() => null);
      const spread = spreadMetrics(payload?.bidPrice, payload?.askPrice);
      const timestamp = Number(payload?.time);
      const ageMs = Date.now() - timestamp;
      if (!response.ok || payload?.symbol !== symbol || !Number.isFinite(spread.bid) || !Number.isFinite(spread.ask) || !Number.isFinite(timestamp) || timestamp <= 0 || ageMs < -1500 || ageMs > 5000) {
        return NextResponse.json({ error: "Binance order-book ticker is stale or invalid.", detail: payload?.msg || "Need a valid bid, ask and exchange timestamp from one snapshot.", venue, symbol, ageMs: Number.isFinite(ageMs) ? ageMs : null, stale: true, readOnly: true, orderPlacement: false }, { status: 502, headers: { "Cache-Control": "no-store" } });
      }
      const price = (Number(spread.bid) + Number(spread.ask)) / 2;
      return NextResponse.json({ ok: true, venue: "binance", symbol, price, priceBasis: "best-bid/ask midpoint", ...spread, spreadAvailable: Number.isFinite(spread.spreadBps), timestamp, ageMs, source: "binance-usdm-book-ticker-mid", stale: false, readOnly: true, orderPlacement: false }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return NextResponse.json({ error: "Binance live order-book ticker unavailable.", detail: error instanceof Error ? error.message : "Unknown error.", venue, symbol, readOnly: true, orderPlacement: false }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
  }

  const instId = symbol.slice(0, -4) + "-USDT-SWAP";
  try {
    const response = await fetch(
      "https://www.okx.com/api/v5/market/ticker?instId=" + encodeURIComponent(instId),
      { cache: "no-store", signal: AbortSignal.timeout(2500) }
    );
    const payload = await response.json().catch(() => null);
    const ticker = payload?.code === "0" && Array.isArray(payload?.data) ? payload.data[0] : null;
    if (!response.ok || !ticker) {
      return NextResponse.json(
        { error: "OKX ticker request failed.", detail: payload?.msg || "Invalid upstream response.", venue, symbol, instId, readOnly: true, orderPlacement: false },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    const price = Number(ticker.last);
    const timestamp = Number(ticker.ts);
    const ageMs = Date.now() - timestamp;
    const spread = spreadMetrics(ticker.bidPx, ticker.askPx);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(timestamp) || timestamp <= 0 || ageMs < -1500 || ageMs > 3000) {
      return NextResponse.json(
        { error: "OKX returned a stale or invalid ticker.", venue, symbol, instId, ageMs, stale: true, readOnly: true, orderPlacement: false },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { ok: true, venue: "okx", symbol, instId, price, ...spread, spreadAvailable: Number.isFinite(spread.spreadBps), timestamp, ageMs, source: "okx-public-rest-ticker", stale: false, readOnly: true, orderPlacement: false },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "OKX live ticker unavailable.", detail: error instanceof Error ? error.message : "Unknown network error.", venue, symbol, instId, readOnly: true, orderPlacement: false },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
