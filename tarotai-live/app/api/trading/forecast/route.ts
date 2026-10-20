import { NextResponse } from "next/server";
import { isAuthorized } from "../../../../lib/auth";
import { buildForecast } from "../../../../lib/forecast.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const intervals = new Set(["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "1d"]);

export async function GET(request: Request) {
  if (!process.env.TAROTAI_ACCESS_CODE) {
    return NextResponse.json({ error: "Private access is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const url = new URL(request.url);
  const symbol = (url.searchParams.get("symbol") || "BTCUSDT").toUpperCase();
  const interval = url.searchParams.get("interval") || "5m";
  const horizonRaw = Number(url.searchParams.get("horizon") || 3);
  const horizon = Number.isInteger(horizonRaw) ? Math.max(1, Math.min(12, horizonRaw)) : 3;
  if (!/^[A-Z0-9]{4,20}USDT$/.test(symbol) || !intervals.has(interval)) {
    return NextResponse.json({ error: "Unsupported symbol or interval." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const endpoint = new URL("https://fapi.binance.com/fapi/v1/klines");
    endpoint.searchParams.set("symbol", symbol);
    endpoint.searchParams.set("interval", interval);
    endpoint.searchParams.set("limit", "120");
    const upstream = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    const raw: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok || !Array.isArray(raw)) {
      return NextResponse.json({ error: "Fresh futures candles are unavailable.", upstreamStatus: upstream.status }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    const candles = raw.filter((k: unknown) => Array.isArray(k) && k.length >= 9).map((k: any[]) => ({
      openTime: Number(k[0]), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]),
      close: Number(k[4]), volume: Number(k[5]), closeTime: Number(k[6])
    })).filter((c: any) => [c.openTime,c.open,c.high,c.low,c.close,c.volume,c.closeTime].every(Number.isFinite)
      && c.open > 0 && c.high >= Math.max(c.open,c.close,c.low) && c.low <= Math.min(c.open,c.close,c.high) && c.volume >= 0);
    if (candles.length < 30) return NextResponse.json({ error: "Insufficient valid candles." }, { status: 502, headers: { "Cache-Control": "no-store" } });
    const forecast = buildForecast(candles, horizon);
    const last = candles[candles.length - 1];
    if (Date.now() - last.closeTime > 2 * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: "Candle data is stale." }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({
      ...forecast, symbol, interval, source: "Binance USDⓈ-M Futures public market candles",
      dataAsOf: new Date(last.closeTime).toISOString(), generatedAt: new Date().toISOString(),
      executionEnabled: false, readOnly: true
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Forecast unavailable.", readOnly: true, executionEnabled: false }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
