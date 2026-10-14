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
      const price = (spread.bid + spread.ask) / 2;
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
