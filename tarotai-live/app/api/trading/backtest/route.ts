import { NextResponse } from "next/server";
import { isAuthorized } from "../../../../lib/auth";
import { assessBacktestEvidence, getIntervalMs, runSmaCrossoverBacktest, validateBacktestCandles, validateFundingRates } from "../../../../lib/trading-backtest.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTERVALS: Record<string, Record<string, string>> = {
  binance: { "1m":"1m", "5m":"5m", "15m":"15m", "30m":"30m", "1h":"1h", "4h":"4h", "1d":"1d" },
  bybit: { "1m":"1", "5m":"5", "15m":"15", "30m":"30", "1h":"60", "4h":"240", "1d":"D" },
  okx: { "1m":"1m", "5m":"5m", "15m":"15m", "30m":"30m", "1h":"1H", "4h":"4H", "1d":"1D" }
};

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number; closeTime: number };
type FundingRate = { time: number; rate: number; markPrice: number };

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

/**
 * Downloads complete Binance USDⓈ-M realized funding history over the candle
 * window. A page cap prevents a long lookback from creating unbounded requests.
 * Binance returns a mark price associated with each funding fee charge.
 */
async function fetchBinanceFundingHistory(symbol: string, startTime: number, endTime: number): Promise<{rates:FundingRate[];sourceHost:string;pages:number}> {
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime <= 0 || endTime < startTime) {
    throw new Error("Invalid candle time range for funding history");
  }
  const collected = new Map<number, FundingRate>();
  const limit = 1000;
  const maxPages = 12;
  let cursor = Math.floor(startTime);
  let pages = 0;
  let complete = false;

  while (pages < maxPages && cursor <= endTime) {
    const endpoint = new URL("https://fapi.binance.com/fapi/v1/fundingRate");
    endpoint.searchParams.set("symbol", symbol);
    endpoint.searchParams.set("startTime", String(cursor));
    endpoint.searchParams.set("endTime", String(Math.floor(endTime)));
    endpoint.searchParams.set("limit", String(limit));

    const response = await fetch(endpoint, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "TarotAI-Backtest-FundingResearch" }
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(payload)) {
      const detail = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
      throw new Error(typeof detail.msg === "string" ? detail.msg.slice(0, 180) : "Binance funding history request failed (HTTP " + response.status + ")");
    }
    pages += 1;
    const rows = payload as Array<Record<string, unknown>>;
    if (rows.length === 0) {
      complete = true;
      break;
    }

    let maxTimestamp = 0;
    for (const row of rows) {
      const time = Number(row.fundingTime);
      if (!Number.isFinite(time) || time <= 0) throw new Error("Binance funding history contained an invalid timestamp");
      maxTimestamp = Math.max(maxTimestamp, time);
      if (time < startTime || time > endTime) continue;
      const rate = Number(row.fundingRate);
      const markPrice = Number(row.markPrice);
      if (!Number.isFinite(rate) || !Number.isFinite(markPrice) || markPrice <= 0) {
        throw new Error("Binance funding history omitted a valid realized rate or settlement mark price");
      }
      const existing = collected.get(time);
      if (existing && (existing.rate !== rate || existing.markPrice !== markPrice)) {
        throw new Error("Binance funding history returned conflicting data for one settlement time");
      }
      collected.set(time, { time, rate, markPrice });
    }

    if (rows.length < limit || maxTimestamp >= endTime) {
      complete = true;
      break;
    }
    const nextCursor = Math.floor(maxTimestamp) + 1;
    if (nextCursor <= cursor) throw new Error("Binance funding history pagination did not advance");
    cursor = nextCursor;
  }

  if (!complete) throw new Error("Funding history exceeded the safe paging bound; results cannot qualify for paper forward testing");
  const rates = validateFundingRates(Array.from(collected.values()).sort((a,b) => a.time - b.time));
  return { rates, sourceHost: "fapi.binance.com", pages };
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
  if (!/^[A-Z0-9]{4,20}$/.test(symbol) || !INTERVALS[venue] || !INTERVALS[venue][interval] ||
      !Number.isInteger(fast) || !Number.isInteger(slow) || fast < 2 || slow <= fast || slow > 100 ||
      !Number.isFinite(feeBps) || feeBps < 0 || feeBps > 50 ||
      !Number.isFinite(slippageBps) || slippageBps < 0 || slippageBps > 50 ||
      !Number.isFinite(requestedLimit) || requestedLimit < 100 || requestedLimit > 1000) {
    return NextResponse.json({ error: "Invalid inputs. Use a supported venue/timeframe, 2 <= fastPeriod < slowPeriod <= 100, costs from 0–50 bps per side, and 100–1000 candles." }, { status: 400 });
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

    let fundingHistory: {rates:FundingRate[];sourceHost:string;pages:number} | null = null;
    let fundingHistoryError: string | null = null;
    if (resolvedVenue === "binance") {
      try {
        fundingHistory = await fetchBinanceFundingHistory(symbol, candles[0].time, candles[candles.length - 1].closeTime);
      } catch (error) {
        fundingHistoryError = error instanceof Error ? error.message.slice(0, 250) : "Binance funding history could not be verified";
      }
    } else {
      fundingHistoryError = "Historical funding costs are not yet integrated for the resolved " + resolvedVenue + " venue; profitability evidence remains blocked.";
    }
    const fundingHistoryVerified = fundingHistory !== null;
    const common = {
      fastPeriod: fast, slowPeriod: slow, feeBps, slippageBps,
      ...(fundingHistoryVerified ? { fundingRates: fundingHistory!.rates } : {})
    };
    const overall = runSmaCrossoverBacktest(candles, { ...common, startIndex: slow } as any);
    const train = runSmaCrossoverBacktest(candles, { ...common, startIndex: slow, endIndex: split } as any);
    const test = runSmaCrossoverBacktest(candles, { ...common, startIndex: split, endIndex: candles.length } as any);
    const holdoutLength = candles.length - split;
    const holdoutSlices = Array.from({ length: 3 }, (_, index) => {
      const startIndex = split + Math.floor(index * holdoutLength / 3);
      const endIndex = split + Math.floor((index + 1) * holdoutLength / 3);
      if (endIndex - startIndex < 3) return { slice: index + 1, candles: endIndex - startIndex, results: null, warning: "Too few candles for a meaningful slice." };
      const results = runSmaCrossoverBacktest(candles, { ...common, startIndex, endIndex } as any);
      return {
        slice: index + 1,
        candles: endIndex - startIndex,
        from: candles[startIndex]?.time ?? null,
        to: candles[endIndex - 1]?.time ?? null,
        results,
        warning: (results as { closedTrades: number }).closedTrades < 10 ? "Fewer than 10 closed trades; metrics are highly uncertain." : null
      };
    });
    const evidenceAssessment = assessBacktestEvidence(
      test as unknown as { closedTrades: number; netReturnPct: number; profitFactor: number | null; maxDrawdownPct: number },
      holdoutSlices as unknown as Array<{ results: { closedTrades: number; netReturnPct: number } | null }>,
      { fundingHistoryVerified }
    );
    const stepMs = getIntervalMs(interval)!;
    return NextResponse.json({
      mode: "RESEARCH_ONLY_NO_ORDERS",
      source: resolvedVenue === "binance" ? "Binance USDⓈ-M Futures public market history" : resolvedVenue === "bybit" ? "Bybit Linear Futures public market history" : "OKX USDT-margined swaps public market history",
      requestedVenue: venue, venue: resolvedVenue, sourceHost, symbol, interval, candles: candles.length, splitIndex: split,
      history: { firstClosedCandleTime: candles[0].time, lastClosedCandleTime: candles[candles.length - 1].time, lastCandleAgeMs: Date.now() - candles[candles.length - 1].time, candleIntervalMs: stepMs, unfinishedCandlesExcluded: true },
      strategy: { type: "simple moving-average crossover", fastPeriod: fast, slowPeriod: slow, signalCalculatedOn: "closed candle", executionAssumption: "next candle open" },
      fundingHistory: {
        status: fundingHistoryVerified ? "VERIFIED" : "UNVERIFIED",
        sourceHost: fundingHistory?.sourceHost ?? null,
        records: fundingHistory?.rates.length ?? null,
        pages: fundingHistory?.pages ?? null,
        startTime: candles[0].time,
        endTime: candles[candles.length - 1].closeTime,
        error: fundingHistoryError
      },
      assumptions: {
        feeBpsPerSide: feeBps, slippageBpsPerSide: slippageBps, fundingCostsIncluded: fundingHistoryVerified,
        fundingMethod: fundingHistoryVerified ? "Realized Binance USDⓈ-M funding rates and exchange-reported settlement mark prices; transfers applied only while the simulated position was open." : "Not included because historical funding data could not be verified.",
        leverage: 1, positionSizing: "100% of current simulated equity, unlevered; illustrative only",
        costsApplied: "adverse slippage, fees on entry and exit, and realized funding when verified", data: "exchange OHLC candles; closed candles only"
      },
      results: overall, train, test, holdoutSlices, evidenceAssessment,
      caveats: [
        "Research baseline only. No live or testnet order is placed.",
        "Next-bar-open fills avoid same-candle-close look-ahead, but real spreads, market impact, liquidation and exchange-specific execution are not fully simulated.",
        "Funding events at exit timestamps are assigned to the previous position; events exactly at entry timestamps are excluded because OHLC cannot establish settlement/order sequencing.",
        "Maximum drawdown estimates intratrade mark-to-market loss from adverse candle highs/lows, fees, slippage and included funding transfers; OHLC candles cannot reconstruct the exact intrabar path.",
        ...(fundingHistoryVerified ? [] : ["Funding costs are not verified for this data source; the evidence gate blocks promotion to paper forward testing."]),
        "The 70/30 split is chronological. Do not tune periods on the test segment; preserve a further untouched period for final confirmation.",
        "The three sequential slices split the 30% holdout to expose regime sensitivity; do not use slice results to retune parameters. Each slice with fewer than 10 trades is low-confidence.",
        "Treat the holdout as weak evidence when trade count is small; seek many more trades across different market regimes and symbols.",
        "A simple SMA crossover may have no edge after costs. Past simulation results do not guarantee future returns."
      ]
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: "Backtest could not obtain valid, fresh closed candles", detail: error instanceof Error ? error.message : "Unknown market-data failure", requestedVenue: venue, venue: resolvedVenue, symbol, interval }, { status: 502 });
  }
}
