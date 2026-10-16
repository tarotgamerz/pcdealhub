import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED = new Set(["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT"]);
const headers = { "Cache-Control": "no-store" };
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers });
function validTicker(price: unknown, timestamp: unknown) {
  const value = Number(price), ts = Number(timestamp), ageMs = Date.now() - ts;
  return Number.isFinite(value) && value > 0 && Number.isFinite(ts) && ts > 0 && ageMs >= -1500 && ageMs <= 3500
    ? { price: value, timestamp: ts, ageMs }
    : null;
}
export async function GET(request: Request) {
  const url = new URL(request.url);
  const venue = (url.searchParams.get("venue") || "binance").toLowerCase();
  const symbol = (url.searchParams.get("symbol") || "BTCUSDT").toUpperCase();
  if (!["binance", "bybit", "okx"].includes(venue) || !SUPPORTED.has(symbol)) {
    return json({ error: "Unsupported live quote venue or symbol.", readOnly: true, orderPlacement: false }, 400);
  }
  try {
    if (venue === "binance") {
      const response = await fetch("https://fapi.binance.com/fapi/v1/ticker/price?symbol=" + encodeURIComponent(symbol), { cache:"no-store", signal:AbortSignal.timeout(2500) });
      const payload = await response.json().catch(() => null);
      const value = Number(payload?.price);
      if (!response.ok || !Number.isFinite(value) || value <= 0) return json({ error:"Binance ticker request failed.", detail:payload?.msg || "Invalid upstream response.", venue, symbol, readOnly:true, orderPlacement:false }, 502);
      return json({ ok:true, venue, symbol, price:value, timestamp:Date.now(), ageMs:0, source:"binance-usdm-rest-ticker", stale:false, readOnly:true, orderPlacement:false });
    }
    if (venue === "bybit") {
      const endpoint = new URL("https://api.bybit.com/v5/market/tickers");
      endpoint.searchParams.set("category","linear");
      endpoint.searchParams.set("symbol",symbol);
      const response = await fetch(endpoint, { cache:"no-store", signal:AbortSignal.timeout(2500) });
      const payload = await response.json().catch(() => null);
      const ticker = payload?.retCode === 0 && Array.isArray(payload?.result?.list) ? payload.result.list[0] : null;
      const checked = response.ok && ticker ? validTicker(ticker.lastPrice,payload.time) : null;
      if (!checked) return json({ error:"Bybit ticker request failed or is stale.", detail:payload?.retMsg || "Invalid or stale upstream response.", venue, symbol, readOnly:true, orderPlacement:false }, 502);
      return json({ ok:true, venue, symbol, ...checked, source:"bybit-linear-rest-ticker", stale:false, readOnly:true, orderPlacement:false });
    }
    const instId = symbol.slice(0, -4) + "-USDT-SWAP";
    const response = await fetch("https://www.okx.com/api/v5/market/ticker?instId=" + encodeURIComponent(instId), { cache:"no-store", signal:AbortSignal.timeout(2500) });
    const payload = await response.json().catch(() => null);
    const ticker = payload?.code === "0" && Array.isArray(payload?.data) ? payload.data[0] : null;
    const checked = response.ok && ticker ? validTicker(ticker.last,ticker.ts) : null;
    if (!checked) return json({ error:"OKX ticker request failed or is stale.", detail:payload?.msg || "Invalid or stale upstream response.", venue, symbol, instId, readOnly:true, orderPlacement:false }, 502);
    return json({ ok:true, venue, symbol, instId, ...checked, source:"okx-public-rest-ticker", stale:false, readOnly:true, orderPlacement:false });
  } catch (error) {
    return json({ error:venue.toUpperCase() + " live ticker unavailable.", detail:error instanceof Error ? error.message : "Unknown network error.", venue, symbol, readOnly:true, orderPlacement:false }, 502);
  }
}
