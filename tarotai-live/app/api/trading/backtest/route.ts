import { NextResponse } from "next/server";
import { isAuthorized } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE = "https://demo-fapi.binance.com";
const SMA = (values: number[], end: number, period: number) => {
  if (end + 1 < period) return null;
  let total = 0;
  for (let i = end - period + 1; i <= end; i++) total += values[i];
  return total / period;
};

export async function POST(request: Request) {
  // This is a private analysis endpoint; fail closed if the private app is not configured.
  if (!process.env.TAROTAI_ACCESS_CODE) {
    return NextResponse.json({ error: "Private access is not configured; set TAROTAI_ACCESS_CODE and redeploy." }, { status: 503 });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }
  const symbol = String(body?.symbol || "BTCUSDT").toUpperCase();
  const interval = String(body?.interval || "15m");
  const fast = Math.floor(Number(body?.fastPeriod || 9));
  const slow = Math.floor(Number(body?.slowPeriod || 21));
  const feeBps = Math.min(50, Math.max(0, Number(body?.feeBps ?? 5)));
  const slippageBps = Math.min(50, Math.max(0, Number(body?.slippageBps ?? 2)));
  const limit = Math.min(500, Math.max(100, Math.floor(Number(body?.limit || 500))));
  if (!/^[A-Z0-9]{4,20}$/.test(symbol) || !["1m","5m","15m","30m","1h","4h","1d"].includes(interval) ||
      fast < 2 || slow <= fast || slow > 100 || !Number.isFinite(feeBps) || !Number.isFinite(slippageBps)) {
    return NextResponse.json({ error: "Invalid inputs. Require fastPeriod >= 2, slowPeriod > fastPeriod and <= 100." }, { status: 400 });
  }
  try {
    const endpoint = new URL("/fapi/v1/klines", BASE);
    endpoint.searchParams.set("symbol", symbol);
    endpoint.searchParams.set("interval", interval);
    endpoint.searchParams.set("limit", String(limit));
    const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    const raw = await response.json();
    if (!response.ok || !Array.isArray(raw) || raw.length < slow + 10) {
      return NextResponse.json({ error: "Insufficient historical candles or upstream error", detail: raw?.msg || "Need more candles" }, { status: 502 });
    }
    const candles = raw.map((k: any[]) => ({ time: Number(k[0]), close: Number(k[4]) }));
    if (candles.some(c => !Number.isFinite(c.time) || !Number.isFinite(c.close) || c.close <= 0) || candles.some((c, i) => i > 0 && c.time <= candles[i - 1].time)) {
      return NextResponse.json({ error: "Malformed or unordered market candles rejected" }, { status: 502 });
    }
    const closes = candles.map(c => c.close);
    const fastMeans = candles.map((_, i) => i + 1 < fast ? NaN : closes.slice(i-fast+1, i+1).reduce((a,b)=>a+b,0)/fast);
    const slowMeans = candles.map((_, i) => i + 1 < slow ? NaN : closes.slice(i-slow+1, i+1).reduce((a,b)=>a+b,0)/slow);
    const split = Math.floor(candles.length * 0.7);
    const feeRate = feeBps / 10000, slipRate = slippageBps / 10000;
    let position = 0, entry = 0, equity = 1, peak = 1, maxDrawdown = 0, trades = 0, wins = 0;
    let trainReturn = 0, testReturn = 0, trainTrades = 0, testTrades = 0;
    const equityCurve: Array<{ time: number; equity: number }> = [];
    for (let i = slow; i < candles.length - 1; i++) {
      const fastNow = fastMeans[i];
      const slowNow = slowMeans[i];
      const fastPrev = fastMeans[i - 1];
      const slowPrev = slowMeans[i - 1];
      const desired = fastNow > slowNow ? 1 : -1;
      const crossed = (fastPrev <= slowPrev && fastNow > slowNow) || (fastPrev >= slowPrev && fastNow < slowNow);
      if (crossed && position !== desired) {
        if (position !== 0) {
          const exitFill = candles[i].close * (1 - position * slipRate);
          const gross = position * (exitFill / entry - 1);
          const feeCost = feeRate * (1 + exitFill / entry);
          const net = gross - feeCost;
          equity *= Math.max(0.01, 1 + net);
          trades++; if (net > 0) wins++;
          if (i < split) { trainReturn += net; trainTrades++; } else { testReturn += net; testTrades++; }
        }
        position = desired;
        entry = candles[i].close * (1 + position * slipRate);
      }
      peak = Math.max(peak, equity);
      maxDrawdown = Math.max(maxDrawdown, (peak - equity) / peak);
      equityCurve.push({ time: candles[i].time, equity: Number(equity.toFixed(6)) });
    }
    const totalReturnPct = (equity - 1) * 100;
    return NextResponse.json({
      mode: "RESEARCH_ONLY_NO_ORDERS", source: "Binance USDⓈ-M Futures demo market data",
      symbol, interval, candles: candles.length, trainCandles: split, testCandles: candles.length - split,
      strategy: { type: "simple moving-average crossover", fastPeriod: fast, slowPeriod: slow },
      assumptions: { feeBpsPerSide: feeBps, slippageBpsPerSide: slippageBps, fundingCostsIncluded: false, leverage: 1, positionSizing: "100% notional per signal; illustrative only" },
      results: { totalReturnPct: Number(totalReturnPct.toFixed(3)), closedTrades: trades, winRatePct: trades ? Number((wins / trades * 100).toFixed(2)) : 0, maxDrawdownPct: Number((maxDrawdown * 100).toFixed(3)), trainApproxReturnPct: Number((trainReturn * 100).toFixed(3)), testApproxReturnPct: Number((testReturn * 100).toFixed(3)), trainTrades, testTrades },
      equityCurve: equityCurve.slice(-200),
      caveats: ["Educational baseline only; not an optimised strategy or trading recommendation.", "This implementation is a simple close-based toy backtest; it does not model liquidation, funding, exchange filters, market impact, or intrabar stop fills.", "The 70/30 split is chronological, but parameters must be selected using training data only and assessed on untouched out-of-sample data.", "No testnet or live order is placed."]
    });
  } catch {
    return NextResponse.json({ error: "Backtest data service failed" }, { status: 502 });
  }
}
