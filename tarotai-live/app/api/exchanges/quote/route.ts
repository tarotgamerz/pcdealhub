import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED = new Set(["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const venue = (url.searchParams.get("venue") || "okx").toLowerCase();
  const symbol = (url.searchParams.get("symbol") || "BTCUSDT").toUpperCase();

  if (!["okx", "binance"].includes(venue) || !SUPPORTED.has(symbol)) {
    return NextResponse.json(
      { error: "Unsupported live quote venue or symbol.", readOnly: true, orderPlacement: false },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (venue === "binance") {
    try {
      const response = await fetch("https://fapi.binance.com/fapi/v1/ticker/price?symbol=" + encodeURIComponent(symbol), { cache: "no-store", signal: AbortSignal.timeout(2500) });
      const payload = await response.json().catch(() => null);
      const price = Number(payload?.price);
      if (!response.ok || !Number.isFinite(price) || price <= 0) {
        return NextResponse.json({ error: "Binance ticker request failed.", detail: payload?.msg || "Invalid upstream response.", venue, symbol, readOnly: true, orderPlacement: false }, { status: 502, headers: { "Cache-Control": "no-store" } });
      }
      return NextResponse.json({ ok: true, venue: "binance", symbol, price, timestamp: Date.now(), ageMs: 0, source: "binance-usdm-rest-ticker", stale: false, readOnly: true, orderPlacement: false }, { headers: { "Cache-Control": "no-store" } });
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
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(timestamp) || timestamp <= 0 || ageMs < -1500 || ageMs > 3000) {
      return NextResponse.json(
        { error: "OKX returned a stale or invalid ticker.", venue, symbol, instId, ageMs, stale: true, readOnly: true, orderPlacement: false },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { ok: true, venue: "okx", symbol, instId, price, timestamp, ageMs, source: "okx-public-rest-ticker", stale: false, readOnly: true, orderPlacement: false },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "OKX live ticker unavailable.", detail: error instanceof Error ? error.message : "Unknown network error.", venue, symbol, instId, readOnly: true, orderPlacement: false },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
