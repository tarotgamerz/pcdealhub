import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED = new Set(["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT"]);

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

  if (!["okx", "binance"].includes(venue) || !SUPPORTED.has(symbol)) {
    return NextResponse.json(
      { error: "Unsupported live quote venue or symbol.", readOnly: true, orderPlacement: false },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (venue === "binance") {
    try {
      // Keep last trade, best bid and best ask from the same response snapshot;
      // separate price/book requests can race during fast markets.
      const response = await fetch("https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=" + encodeURIComponent(symbol), { cache: "no-store", signal: AbortSignal.timeout(2500) });
      const payload = await response.json().catch(() => null);
      const price = Number(payload?.lastPrice);
      if (!response.ok || !Number.isFinite(price) || price <= 0) {
        return NextResponse.json({ error: "Binance ticker request failed.", detail: payload?.msg || "Invalid upstream response.", venue, symbol, readOnly: true, orderPlacement: false }, { status: 502, headers: { "Cache-Control": "no-store" } });
      }
      const spread = spreadMetrics(payload?.bidPrice, payload?.askPrice);
      const timestamp = Date.now();
      return NextResponse.json({ ok: true, venue: "binance", symbol, price, ...spread, spreadAvailable: Number.isFinite(spread.spreadBps), timestamp, observedAt: timestamp, timestampMeaning: "server-observed response time; Binance 24h ticker closeTime is a rolling-window boundary, not an event timestamp", ageMs: 0, source: "binance-usdm-24hr-ticker", stale: false, readOnly: true, orderPlacement: false }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return NextResponse.json({ error: "Binance live ticker unavailable.", detail: error instanceof Error ? error.message : "Unknown error.", venue, symbol, readOnly: true, orderPlacement: false }, { status: 502, headers: { "Cache-Control": "no-store" } });
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
