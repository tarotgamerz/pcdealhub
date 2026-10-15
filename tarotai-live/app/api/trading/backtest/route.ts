import { NextResponse } from "next/server";
import { isAuthorized } from "../../../../lib/auth";
import { getIntervalMs, runSmaCrossoverBacktest, validateBacktestCandles } from "../../../../lib/trading-backtest.mjs";
import { runLiveAgentStrategyBacktest } from "../../../../lib/live-agent-backtest.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTERVALS: Record<string, Record<string, string>> = {
  binance: { "1m":"1m", "5m":"5m", "15m":"15m", "30m":"30m", "1h":"1h", "4h":"4h", "1d":"1d" },
  bybit: { "1m":"1", "5m":"5", "15m":"15", "30m":"30", "1h":"60", "4h":"240", "1d":"D" },
  okx: { "1m":"1m", "5m":"5m", "15m":"15m", "30m":"30m", "1h":"1H", "4h":"4H", "1d":"1D" }
};
const HIGHER_INTERVAL: Record<string, string> = {
  "1m":"15m", "5m":"1h", "15m":"4h", "30m":"4h", "1h":"1d", "4h":"1d", "1d":"1d"
};

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number; closeTime: number };
async function fetchHistory(venue: string, symbol: string, interval: string, limit: number): Promise<{candles:Candle[];sourceHost:string}> {
  const stepMs = getIntervalMs(interval);
  if (!stepMs) throw new Error("Unsupported interval");
  if (venue === "okx") {
    const instId = symbol.endsWith("USDT") ? symbol.slice(0, -4) + "-USDT-SWAP" : symbol;
    const target = Math.min(1000, Math.max(1, limit));
    const collected = new Map<number, Candle>();
    let after: string | null = null;
    const maxPages = Math.ceil(target / 300);
    for (let pageIndex = 0; pageIndex < maxPages && collected.size < target; pageIndex++) {
      const pageLimit = Math.min(300, target - collected.size);
      const endpoint = new URL("https://www.okx.com/api/v5/market/candles");
      endpoint.searchParams.set("instId", instId);
      endpoint.searchParams.set("bar", INTERVALS.okx[interval]);
      endpoint.searchParams.set("limit", String(pageLimit));
      if (after) endpoint.searchParams.set("after", after);
      const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      const payload: any = await response.json().catch(() => null);
      if (!response.ok || payload?.code !== "0" || !Array.isArray(payload?.data)) {
        throw new Error(payload?.msg || "OKX historical-candle request failed (HTTP " + response.status + ")");
      }
      const page: any[][] = payload.data;
      if (!page.length) break;
      for (const k of page) {
        const time = +k[0];
        const closeTime = time + stepMs - 1;
        if (k[8] === "1" && closeTime < Date.now() && [time,+k[1],+k[2],+k[3],+k[4]].every(Number.isFinite)) {
          collected.set(time, { time, open:+k[1], high:+k[2], low:+k[3], close:+k[4], volume:+k[5], closeTime });
        }
      }
      const timestamps = page.map(k => +k[0]).filter(Number.isFinite);
      const oldest = timestamps.length ? Math.min(...timestamps) : NaN;
      if (!Number.isFinite(oldest) || (after !== null && oldest >= Number(after))) break;
      after = String(oldest);
      if (page.length < pageLimit) break;
    }
    const candles = Array.from(collected.values()).sort((a,b) => a.time - b.time).slice(-target);
    if (candles.length < 1) throw new Error("OKX returned no confirmed historical candles");
    validateBacktestCandles(candles);
    const last = candles[candles.length - 1];
    if (Date.now() - (last.time + stepMs) > stepMs + 60_000) throw new Error("The most recent closed OKX candle is stale");
    return { candles, sourceHost: "www.okx.com" };
  }

  let candidates: URL[] = [];
  if (venue === "binance") {
    candidates = ["fapi.binance.com", "fapi1.binance.com", "fapi2.binance.com", "fapi3.binance.com"].map(host => {
      const u = new URL("https://" + host + "/fapi/v1/klines");
      u.searchParams.set("symbol", symbol); u.searchParams.set("interval", interval); u.searchParams.set("limit", String(limit));
      return u;
    });
  } else if (venue === "bybit") {
    const u = new URL("https://api.bybit.com/v5/market/kline");
    u.searchParams.set("category", "linear"); u.searchParams.set("symbol", symbol);
    u.searchParams.set("interval", INTERVALS.bybit[interval]); u.searchParams.set("limit", String(limit));
    candidates = [u];
  } else {
    throw new Error("Unsupported exchange venue");
  }

  let lastError = "No market-data response";
  for (const endpoint of candidates) {
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(6000) });
      const payload: any = await response.json().catch(() => null);
      if (!response.ok) { lastError = payload?.msg || payload?.retMsg || "HTTP " + response.status; continue; }
      let candles: Candle[] = [];
      if (venue === "binance" && Array.isArray(payload)) {
        candles = payload.map((k: any[]) => ({ time:+k[0], open:+k[1], high:+k[2], low:+k[3], close:+k[4], volume:+k[5], closeTime:+k[6] }))
          .filter((c: Candle) => c.closeTime < Date.now());
      } else if (venue === "bybit" && payload?.retCode === 0 && Array.isArray(payload?.result?.list)) {
        candles = payload.result.list.slice().reverse().map((k: any[]) => ({ time:+k[0], open:+k[1], high:+k[2], low:+k[3], close:+k[4], volume:+k[5], closeTime:+k[0] + stepMs - 1 }))
          .filter((c: Candle) => c.closeTime < Date.now());
      } else {
        lastError = payload?.msg || payload?.retMsg || "Unexpected candle response";
        continue;
      }
      if (candles.length < 1) { lastError = "The exchange returned no closed candles"; continue; }
      validateBacktestCandles(candles);
      const last = candles[candles.length - 1];
      const ageAfterClose = Date.now() - (last.time + stepMs);
      if (ageAfterClose > stepMs + 60_000) { lastError = "The most recent closed candle is stale"; continue; }
      return { candles, sourceHost: endpoint.host };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Market-data request failed";
    }
  }
  throw new Error(lastError);
}

export async function POST(request: Request) {
  if (!process.env.TAROTAI_ACCESS_CODE) {
    return NextResponse.json({ error: "Private access is not configured; set TAROTAI_ACCESS_CODE and redeploy." }, { status: 503 });
  }
  if (!isAuthorized(request)) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }

  const symbol = String(body?.symbol || "BTCUSDT").toUpperCase();
  const venue = String(body?.venue || "binance").toLowerCase();
  const interval = String(body?.interval || "15m");
  const fast = Number(body?.fastPeriod ?? 9);
  const slow = Number(body?.slowPeriod ?? 21);
  const feeBps = Number(body?.feeBps ?? 5);
  const slippageBps = Number(body?.slippageBps ?? 2);
  const requestedLimit = Number(body?.limit ?? 1000);
  const initialBalance = Number(body?.initialBalance ?? 10000);
  const liveAgentRiskPct = Number(body?.liveAgentRiskPct ?? 0.5);
  if (!/^[A-Z0-9]{4,20}$/.test(symbol) || !INTERVALS[venue] || !INTERVALS[venue][interval] ||
      !Number.isInteger(fast) || !Number.isInteger(slow) || fast < 2 || slow <= fast || slow > 100 ||
      !Number.isFinite(feeBps) || feeBps < 0 || feeBps > 50 ||
      !Number.isFinite(slippageBps) || slippageBps < 0 || slippageBps > 50 ||
      !Number.isFinite(requestedLimit) || requestedLimit < 100 || requestedLimit > 1000 ||
      !Number.isFinite(initialBalance) || initialBalance < 100 || initialBalance > 10000000 ||
      !Number.isFinite(liveAgentRiskPct) || liveAgentRiskPct < 0.1 || liveAgentRiskPct > 1) {
    return NextResponse.json({ error: "Invalid inputs. Use a supported venue/timeframe, valid SMA periods, costs from 0–50 bps per side, 100–1000 candles, a 100–10,000,000 USDT test balance and 0.1–1% live-agent paper risk." }, { status: 400 });
  }

  let resolvedVenue = venue;
  try {
    let marketHistory: { candles: Candle[]; sourceHost: string } | null = null;
    const feedErrors: string[] = [];
    // Hosting regions may be blocked by individual exchanges. Fall back only
    // across read-only public candle APIs and report the actual source used.
    const venueOrder = [venue, ...Object.keys(INTERVALS).filter(candidate => candidate !== venue)];
    for (const candidateVenue of venueOrder) {
      try {
        marketHistory = await fetchHistory(candidateVenue, symbol, interval, Math.floor(requestedLimit));
        resolvedVenue = candidateVenue;
        break;
      } catch (feedError) {
        feedErrors.push(candidateVenue + ": " + (feedError instanceof Error ? feedError.message : "feed unavailable"));
      }
    }
    if (!marketHistory) throw new Error(feedErrors.join(" | "));
    const { candles, sourceHost } = marketHistory;
    const split = Math.floor(candles.length * 0.7);
    if (candles.length < Math.max(60, slow + 10) || split - slow < 3 || candles.length - split < 3) {
      return NextResponse.json({ error: "Not enough closed history for a useful chronological 70/30 split. Increase the candle limit or reduce the slow SMA period.", requestedVenue: venue, venue: resolvedVenue, sourceHost, symbol, candles: candles.length, minimumUsefulHistory: Math.max(60, Math.ceil((slow + 3) / 0.7)) }, { status: 422 });
    }
    const common = { fastPeriod: fast, slowPeriod: slow, feeBps, slippageBps };
    const overall = runSmaCrossoverBacktest(candles, { ...common, startIndex: slow } as any);
    const train = runSmaCrossoverBacktest(candles, { ...common, startIndex: slow, endIndex: split } as any);
    const test = runSmaCrossoverBacktest(candles, { ...common, startIndex: split, endIndex: candles.length } as any);
    const stepMs = getIntervalMs(interval)!;
    const higherInterval = HIGHER_INTERVAL[interval] || interval;
    let liveAgentStrategy: Record<string, unknown>;
    let higherTimeframeContext: Record<string, unknown> | null = null;
    try {
      // Keep both strategy and higher-timeframe candles on the exact venue resolved for the main sample.
      const higherHistory = await fetchHistory(resolvedVenue, symbol, higherInterval, Math.min(1000, Math.max(180, Math.floor(requestedLimit))));
      const higherCandles = higherHistory.candles;
      higherTimeframeContext = {
        interval: higherInterval,
        sourceHost: higherHistory.sourceHost,
        closedCandles: higherCandles.length,
        firstClosedCandleTime: higherCandles[0]?.time ?? null,
        lastClosedCandleTime: higherCandles[higherCandles.length - 1]?.time ?? null,
        alignment: "Only higher-timeframe candles whose closeTime is at or before each main signal candle close are considered."
      };
      const liveOptions = { initialBalance, riskPct: liveAgentRiskPct, feeBps, slippageBps, maxPositionExposurePct: 5, maxPortfolioExposurePct: 20, maxEntryDriftPct: 1 };
      liveAgentStrategy = {
        model: "live-agent-rules-v1",
        directionRule: "EMA 9/21/50 + RSI 14 band + momentum + 20-bar breakout/breakdown + aligned HTF EMA 20/50",
        higherTimeframe: higherInterval,
        startingBalanceUSDT: initialBalance,
        riskPctPerTrade: liveAgentRiskPct,
        perPositionNotionalCapPct: 5,
        portfolioNotionalCapPct: 20,
        fullSample: runLiveAgentStrategyBacktest(candles, higherCandles, { ...liveOptions, fromIndex: 79, endIndex: candles.length, signalStartIndex: 79 }),
        train: runLiveAgentStrategyBacktest(candles, higherCandles, { ...liveOptions, fromIndex: 79, endIndex: split, signalStartIndex: 79 }),
        holdout: runLiveAgentStrategyBacktest(candles, higherCandles, { ...liveOptions, fromIndex: split, endIndex: candles.length, signalStartIndex: split })
      };
    } catch (strategyError) {
      liveAgentStrategy = {
        available: false,
        model: "live-agent-rules-v1",
        reason: strategyError instanceof Error ? strategyError.message : "Higher-timeframe history was unavailable",
        warnings: ["The SMA research baseline below ran separately. The exact live-agent rules were not scored because same-venue higher-timeframe data was unavailable."]
      };
    }
    return NextResponse.json({
      mode: "RESEARCH_ONLY_NO_ORDERS",
      source: resolvedVenue === "binance" ? "Binance USDⓈ-M Futures public market history" : resolvedVenue === "bybit" ? "Bybit Linear Futures public market history" : "OKX USDT-margined swaps public market history",
      requestedVenue: venue, venue: resolvedVenue, sourceHost, symbol, interval, candles: candles.length, splitIndex: split,
      liveAgentStrategy,
      higherTimeframeContext,
      history: { firstClosedCandleTime: candles[0].time, lastClosedCandleTime: candles[candles.length - 1].time, lastCandleAgeMs: Date.now() - candles[candles.length - 1].time, candleIntervalMs: stepMs, unfinishedCandlesExcluded: true },
      strategy: { type: "simple moving-average crossover", fastPeriod: fast, slowPeriod: slow, signalCalculatedOn: "closed candle", executionAssumption: "next candle open" },
      assumptions: {
        feeBpsPerSide: feeBps, slippageBpsPerSide: slippageBps, fundingCostsIncluded: false,
        leverage: 1, positionSizing: "100% of current simulated equity, unlevered; illustrative only",
        costsApplied: "adverse slippage and fees on entry and exit", data: "exchange OHLC candles; closed candles only"
      },
      results: overall, train, test,
      caveats: [
        "Research baseline only. No live or testnet order is placed.",
        "Next-bar-open fills avoid same-candle-close look-ahead, but real spreads, market impact, funding, liquidation, and exchange-specific execution are not fully simulated.",
        "Maximum drawdown uses closed-trade equity; intratrade drawdown can be worse.",
        "The 70/30 split is chronological. Do not tune periods on the test segment; preserve a further untouched period for final confirmation.",
        "Treat the holdout as weak evidence when trade count is small; seek many more trades across different market regimes and symbols.",
        "A simple SMA crossover may have no edge after costs. Past simulation results do not guarantee future returns.",
        "Live-agent strategy results are a rule-replication research test, not a claim of validated profitability. Treat empty/small holdout samples as inconclusive; use a further untouched period and paper forward testing."
      ]
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: "Backtest could not obtain valid, fresh closed candles", detail: error instanceof Error ? error.message : "Unknown market-data failure", requestedVenue: venue, venue: resolvedVenue, symbol, interval }, { status: 502 });
  }
}
