import { NextResponse } from "next/server";
import { isAuthorized } from "../../../../lib/auth";
import { normalizeDepthSnapshot, summarizeOrderBook } from "../../../../lib/orderbook.mjs";
import { createPaperApprovalToken, verifyPaperApprovalToken } from "../../../../lib/paper-approval.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BOOK_AGE_MS = 15_000;
const MAX_SPREAD_BPS = 10;
const MAX_DRIFT = 0.0025;
const INTERVAL_MS: Record<string, number> = {
  "1m": 60_000, "3m": 180_000, "5m": 300_000, "15m": 900_000,
  "30m": 1_800_000, "1h": 3_600_000, "2h": 7_200_000, "4h": 14_400_000, "1d": 86_400_000
};
const closeEnough = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) &&
  Math.abs(a - b) <= Math.max(1e-8, Math.abs(b) * 1e-8);

async function fetchFreshBook(symbol: string, venue: string) {
  let endpoint: URL;
  let normalize: (raw: any) => unknown;
  if (venue === "binance") {
    endpoint = new URL("https://fapi.binance.com/fapi/v1/depth");
    endpoint.searchParams.set("symbol", symbol);
    endpoint.searchParams.set("limit", "5");
    normalize = (raw: any) => raw;
  } else if (venue === "bybit") {
    endpoint = new URL("https://api.bybit.com/v5/market/orderbook");
    endpoint.searchParams.set("category", "linear");
    endpoint.searchParams.set("symbol", symbol);
    endpoint.searchParams.set("limit", "25");
    normalize = (raw: any) => ({
      lastUpdateId: Number(raw?.result?.u ?? raw?.result?.seq ?? Date.now()),
      E: Number(raw?.time ?? raw?.result?.ts),
      T: Number(raw?.time ?? raw?.result?.ts),
      bids: raw?.result?.b ?? raw?.result?.bids,
      asks: raw?.result?.a ?? raw?.result?.asks
    });
  } else if (venue === "okx") {
    const instId = symbol.endsWith("USDT") ? symbol.slice(0, -4) + "-USDT-SWAP" : symbol;
    endpoint = new URL("https://www.okx.com/api/v5/market/books");
    endpoint.searchParams.set("instId", instId);
    endpoint.searchParams.set("sz", "5");
    normalize = (raw: any) => ({
      lastUpdateId: Number(raw?.data?.[0]?.seqId ?? Date.now()),
      E: Number(raw?.data?.[0]?.ts),
      T: Number(raw?.data?.[0]?.ts),
      bids: raw?.data?.[0]?.bids,
      asks: raw?.data?.[0]?.asks
    });
  } else {
    throw new Error("Unsupported paper review venue.");
  }
  const response = await fetch(endpoint, {
    cache: "no-store",
    signal: AbortSignal.timeout(3500),
    headers: { "User-Agent": "TarotAI-PaperRiskReview" }
  });
  if (!response.ok) throw new Error("Exchange order book returned HTTP " + response.status);
  const raw: any = await response.json();
  if ((venue === "bybit" && raw?.retCode !== 0) || (venue === "okx" && raw?.code !== "0")) {
    throw new Error("Exchange order book response was not successful.");
  }
  const snapshot = normalizeDepthSnapshot(symbol, normalize(raw));
  const metrics = summarizeOrderBook(snapshot, Date.now());
  if (metrics.snapshotAgeMs === null || metrics.snapshotAgeMs < 0 || metrics.snapshotAgeMs > MAX_BOOK_AGE_MS) {
    throw new Error("Exchange order-book snapshot is stale or has no valid exchange timestamp.");
  }
  return metrics;
}

function reject(issues: string[], status = 409) {
  return NextResponse.json({
    mode: "PAPER_ONLY",
    strategyAgent: { agent: "StrategyReview", verdict: "REJECT", issues },
    riskAgent: { agent: "IndependentRisk", verdict: "VETO", issues },
    combinedVerdict: "REJECT",
    paperExecutionToken: null,
    liveTradingEnabled: false
  }, { status });
}

export async function POST(req: Request) {
  if (!process.env.TAROTAI_ACCESS_CODE) {
    return NextResponse.json({ error: "Private access is not configured" }, { status: 503 });
  }
  if (!isAuthorized(req)) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Expected JSON" }, { status: 400 }); }

  const secret = process.env.UPSTASH_REDIS_REST_TOKEN || "";
  const gate = verifyPaperApprovalToken(String(body.approvalToken || ""), secret);
  if (!gate || gate.tokenType !== "PAPER_GATE") {
    return reject(["A fresh signed server-side AI trade-gate approval is required before risk review."], 403);
  }

  const symbol = String(body.symbol || "").toUpperCase();
  const venue = String(body.venue || "").toLowerCase();
  const interval = String(body.interval || "");
  const entry = Number(body.entry);
  const stop = Number(body.stop);
  const target = Number(body.target);
  const riskPct = Number(body.riskPct);
  const balance = Number(body.paperBalance);
  const side = String(body.side || "").toUpperCase();
  const issues: string[] = [];

  if (symbol !== gate.symbol || venue !== gate.venue || interval !== gate.interval) {
    issues.push("Symbol, venue or timeframe differs from the signed gate.");
  }
  if (side !== (gate.direction === "LONG" ? "LONG" : "SHORT")) {
    issues.push("Requested side differs from the signed gate.");
  }
  if (!closeEnough(entry, Number(gate.entry)) || !closeEnough(stop, Number(gate.stop)) ||
      !closeEnough(target, Number(gate.target))) {
    issues.push("Entry, stop and target must match the signed price plan exactly.");
  }
  if (!closeEnough(balance, Number(gate.paperEquity)) || !closeEnough(riskPct, Number(gate.riskPct))) {
    issues.push("Paper equity and risk must match the signed settings.");
  }
  if (![entry, stop, target, riskPct, balance].every(Number.isFinite) || entry <= 0 || stop <= 0 || target <= 0) {
    issues.push("Entry, stop, target, equity and risk settings must be finite and valid.");
  }
  if (riskPct < 0.1 || riskPct > 1 || balance < 100 || balance > 10_000_000) {
    issues.push("Paper equity must be 100–10,000,000 USDT and risk must be 0.1%–1%.");
  }
  const validGeometry = gate.direction === "LONG" ? stop < entry && target > entry : target < entry && entry < stop;
  if (!validGeometry) issues.push("Entry, stop and target do not match valid directional geometry.");
  const riskDistance = Math.abs(entry - stop);
  const rewardRisk = riskDistance > 0 ? Math.abs(target - entry) / riskDistance : 0;
  if (rewardRisk < 2) issues.push("Calculated reward/risk is below 2R.");

  let book: any = null;
  try { book = await fetchFreshBook(symbol, venue); }
  catch (error) { issues.push(error instanceof Error ? error.message : "Fresh same-venue order book unavailable."); }
  if (!book) {
    issues.push("No fresh same-venue order-book snapshot could be verified.");
  } else {
    const spreadBps = Number(book.spreadBps);
    const drift = Math.abs(Number(book.midPrice) - Number(gate.entry)) / Number(gate.entry);
    if (!Number.isFinite(spreadBps) || spreadBps < 0 || spreadBps > MAX_SPREAD_BPS) {
      issues.push("Current spread is invalid or exceeds the provisional 10 bps ceiling.");
    }
    if (!Number.isFinite(drift) || drift > MAX_DRIFT) {
      issues.push("Current order-book mid-price has moved more than 0.25% from the signed entry; rerun analysis.");
    }
  }

  if (issues.length || !book) return reject(issues.length ? issues : ["Fresh book unavailable."]);

  const tokenNow = Date.now();
  let paperExecutionToken: string;
  try {
    paperExecutionToken = createPaperApprovalToken({
      ...gate,
      tokenType: "PAPER_EXECUTION",
      bookAgeMs: book.snapshotAgeMs,
      bookFetchedAtMs: tokenNow,
      bookMid: book.midPrice,
      bookSpreadBps: book.spreadBps,
      bookLastUpdateId: book.lastUpdateId
    }, secret, tokenNow, 15_000);
  } catch {
    return reject(["A short-lived execution approval could not be signed; no paper entry is authorized."], 503);
  }

  return NextResponse.json({
    mode: "PAPER_ONLY",
    strategyAgent: {
      agent: "StrategyReview",
      verdict: "CONDITIONALLY_ACCEPT",
      checks: ["signed server gate", "trade geometry", "reward/risk", "fresh same-venue order book", "entry drift"],
      issues: []
    },
    riskAgent: {
      agent: "IndependentRisk",
      verdict: "PAPER_ONLY_APPROVAL",
      riskBudget: Number((balance * riskPct / 100).toFixed(2)),
      stopDistancePct: entry > 0 ? Number((riskDistance / entry * 100).toFixed(4)) : null,
      hardLimits: ["no live orders", "stale data veto", "maximum 1% balance risk"],
      issues: []
    },
    combinedVerdict: "PAPER_ONLY_APPROVAL",
    riskReward: Number(rewardRisk.toFixed(3)),
    currentBook: {
      bestBid: book.bestBid,
      bestAsk: book.bestAsk,
      midPrice: book.midPrice,
      spreadBps: book.spreadBps,
      snapshotAgeMs: book.snapshotAgeMs,
      depthImbalancePct: book.depthImbalancePct
    },
    paperExecutionToken,
    liveTradingEnabled: false,
    disclaimer: "Deterministic guardrails only; the review creates one short-lived paper execution authorization. It is not proof of strategy edge."
  }, { headers: { "Cache-Control": "no-store" } });
}
