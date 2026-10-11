import { NextResponse } from "next/server";
import { isAuthorized } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public market data only. This endpoint deliberately has no order-placement code.
const BASE = "https://demo-fapi.binance.com";

export async function GET(request: Request) {
  if (!process.env.TAROTAI_ACCESS_CODE) {
    return NextResponse.json({ error: "Private access is not configured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const url = new URL(request.url);
  const symbol = (url.searchParams.get("symbol") || "BTCUSDT").toUpperCase();
  const interval = url.searchParams.get("interval") || "1m";
  const limit = Math.min(500, Math.max(20, Number(url.searchParams.get("limit") || 100)));
  if (!/^[A-Z0-9]{4,20}$/.test(symbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }
  if (!["1m","3m","5m","15m","30m","1h","2h","4h","1d"].includes(interval)) {
    return NextResponse.json({ error: "Unsupported interval" }, { status: 400 });
  }
  try {
    const endpoint = new URL("/fapi/v1/klines", BASE);
    endpoint.searchParams.set("symbol", symbol);
    endpoint.searchParams.set("interval", interval);
    endpoint.searchParams.set("limit", String(limit));
    const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    const raw = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: "Binance Futures demo market-data request failed", detail: raw?.msg || "Upstream error" }, { status: 502 });
    }
    const candles = Array.isArray(raw) ? raw.map((k: any[]) => ({
      openTime: Number(k[0]), open: Number(k[1]), high: Number(k[2]),
      low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]),
      closeTime: Number(k[6]), quoteVolume: Number(k[7]), trades: Number(k[8])
    })) : [];
    return NextResponse.json({
      source: "Binance USDⓈ-M Futures demo market data",
      symbol, interval, fetchedAt: new Date().toISOString(), candles,
      warning: "Market data only. This endpoint cannot place or cancel orders."
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Market-data service unavailable or timed out" }, { status: 502 });
  }
}
