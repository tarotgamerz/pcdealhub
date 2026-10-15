import { validateBacktestCandles } from "./trading-backtest.mjs";

const MIN_SIGNAL_HISTORY = 80;
const HTF_LOOKBACK = 180;

function validateCandleSeries(candles, label) {
  validateBacktestCandles(candles);
  if (candles.some((c) => !Number.isFinite(c.closeTime) || c.closeTime <= c.time)) {
    throw new Error(label + " candles require closeTime after open time");
  }
}
function ema(values, period) {
  if (!values.length) return [];
  const k = 2 / (period + 1), out = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}
function rsi(values, period = 14) {
  const out = Array(values.length).fill(NaN);
  if (values.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    gain += Math.max(d, 0); loss += Math.max(-d, 0);
  }
  gain /= period; loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}
function atr(candles, period = 14) {
  const tr = candles.map((c, i) => i === 0 ? c.high - c.low : Math.max(
    c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close)
  ));
  const out = Array(tr.length).fill(NaN);
  if (tr.length < period) return out;
  let value = tr.slice(0, period).reduce((s, v) => s + v, 0) / period;
  out[period - 1] = value;
  for (let i = period; i < tr.length; i++) {
    value = (value * (period - 1) + tr[i]) / period;
    out[i] = value;
  }
  return out;
}
function calculateIndicators(candles) {
  const closes = candles.map((c) => c.close);
  return { e9: ema(closes, 9), e21: ema(closes, 21), e50: ema(closes, 50), rsi: rsi(closes), atr: atr(candles) };
}
function trendAt(higher, mainCloseTime) {
  let end = 0;
  while (end < higher.length && higher[end].closeTime <= mainCloseTime) end++;
  const past = higher.slice(Math.max(0, end - HTF_LOOKBACK), end);
  if (past.length < 55) return { ready: false, direction: "UNAVAILABLE" };
  const closes = past.map((c) => c.close), e20 = ema(closes, 20), e50 = ema(closes, 50), last = closes.length - 1;
  const up = closes[last] > e50[last] && e20[last] > e50[last];
  const down = closes[last] < e50[last] && e20[last] < e50[last];
  return { ready: true, up, down, direction: up ? "BULLISH" : down ? "BEARISH" : "MIXED / NEUTRAL", candleTime: past[last].time };
}
function signalAt(candles, higher, i, ind) {
  if (i < MIN_SIGNAL_HISTORY - 1 || i >= candles.length) return { signal: null, reason: "WARMUP" };
  const last = candles[i], prev = candles[i - 1], av = ind.atr[i], rv = ind.rsi[i];
  if (!Number.isFinite(av) || av <= 0 || !Number.isFinite(rv)) return { signal: null, reason: "INDICATORS_UNAVAILABLE" };
  const prior = candles.slice(i - 20, i);
  if (prior.length !== 20) return { signal: null, reason: "WARMUP" };
  const priorHigh = Math.max(...prior.map((c) => c.high)), priorLow = Math.min(...prior.map((c) => c.low));
  const upBreak = last.close > priorHigh, downBreak = last.close < priorLow;
  const longChecks = [ind.e9[i] > ind.e21[i], last.close > ind.e50[i], rv >= 52 && rv <= 70,
    ind.e9[i] > ind.e9[Math.max(0, i - 3)] && last.close > prev.close, upBreak];
  const shortChecks = [ind.e9[i] < ind.e21[i], last.close < ind.e50[i], rv >= 30 && rv <= 48,
    ind.e9[i] < ind.e9[Math.max(0, i - 3)] && last.close < prev.close, downBreak];
  const longScore = longChecks.filter(Boolean).length, shortScore = shortChecks.filter(Boolean).length;
  const htf = trendAt(higher, last.closeTime);
  if (!htf.ready) return { signal: null, reason: "HIGHER_TIMEFRAME_UNAVAILABLE", longScore, shortScore };
  const side = htf.up && longScore >= 4 && upBreak ? "LONG" : htf.down && shortScore >= 4 && downBreak ? "SHORT" : null;
  if (!side) return { signal: null, reason: "NO_QUALIFIED_SETUP", longScore, shortScore, higherTrend: htf.direction };
  const recent = candles.slice(Math.max(0, i - 7), i + 1), entry = last.close;
  const stop = side === "LONG"
    ? Math.min(entry - av * 1.5, Math.min(...recent.map((c) => c.low)) - av * 0.1)
    : Math.max(entry + av * 1.5, Math.max(...recent.map((c) => c.high)) + av * 0.1);
  if (!Number.isFinite(stop) || stop <= 0 || (side === "LONG" ? stop >= entry : stop <= entry)) return { signal: null, reason: "INVALID_STOP" };
  const risk = Math.abs(entry - stop);
  return { reason: "QUALIFIED", signal: {
    side, signalIndex: i, signalTime: last.time, signalCloseTime: last.closeTime, entryReference: entry, stop,
    target: side === "LONG" ? entry + risk * 2 : entry - risk * 2,
    atr: av, rsi: rv, longScore, shortScore, higherTrend: htf.direction, higherCandleTime: htf.candleTime
  } };
}

export function evaluateLiveAgentSignal(mainCandles, higherCandles, index) {
  validateCandleSeries(mainCandles, "Main timeframe");
  validateCandleSeries(higherCandles, "Higher timeframe");
  if (!Number.isInteger(index) || index < 0 || index >= mainCandles.length) throw new Error("Signal index is outside candle history");
  return signalAt(mainCandles, higherCandles, index, calculateIndicators(mainCandles));
}

export function runLiveAgentStrategyBacktest(mainCandles, higherCandles, options = {}) {
  validateCandleSeries(mainCandles, "Main timeframe");
  validateCandleSeries(higherCandles, "Higher timeframe");
  const initialBalance = Number(options.initialBalance ?? 10000), riskPct = Number(options.riskPct ?? 0.5);
  const feeBps = Number(options.feeBps ?? 5), slippageBps = Number(options.slippageBps ?? 2);
  const maxPositionPct = Number(options.maxPositionExposurePct ?? 5), maxPortfolioPct = Number(options.maxPortfolioExposurePct ?? 20);
  const maxDriftPct = Number(options.maxEntryDriftPct ?? 1);
  const from = Math.max(0, Math.floor(Number(options.fromIndex ?? MIN_SIGNAL_HISTORY - 1)));
  const end = Math.min(mainCandles.length, Math.floor(Number(options.endIndex ?? mainCandles.length)));
  const signalFrom = Math.max(from, Math.floor(Number(options.signalStartIndex ?? from)));
  if (![initialBalance, riskPct, feeBps, slippageBps, maxPositionPct, maxPortfolioPct, maxDriftPct].every(Number.isFinite) ||
      initialBalance < 100 || initialBalance > 10000000 || riskPct < 0.1 || riskPct > 1 ||
      feeBps < 0 || feeBps > 50 || slippageBps < 0 || slippageBps > 50 ||
      maxPositionPct <= 0 || maxPositionPct > 5 || maxPortfolioPct <= 0 || maxPortfolioPct > 20 ||
      maxDriftPct < 0 || maxDriftPct > 5) throw new Error("Invalid live-agent backtest settings");
  if (end - from < 2 || signalFrom >= end) return { available: false, reason: "Not enough candles in this chronological segment.", closedTrades: 0, warnings: ["No performance claim is made from an empty sample."] };

  const ind = calculateIndicators(mainCandles), fee = feeBps / 10000, slip = slippageBps / 10000;
  let equity = initialBalance, peak = initialBalance, maxDD = 0, position = null;
  let signalsEvaluated = 0, qualifiedSignals = 0, driftSkips = 0, invalidatedSkips = 0, sizingSkips = 0;
  let stopExits = 0, targetExits = 0, windowEndCloses = 0, ambiguousExits = 0;
  const trades = [];
  const updateDD = (markedEquity) => {
    if (!Number.isFinite(markedEquity)) return;
    peak = Math.max(peak, markedEquity);
    if (peak > 0) maxDD = Math.max(maxDD, (peak - markedEquity) / peak);
  };
  const hypotheticalEquity = (rawPrice, pos) => {
    const closeSide = pos.side === "LONG" ? "SELL" : "BUY";
    const fill = rawPrice * (1 + (closeSide === "BUY" ? 1 : -1) * slip);
    return equity + (pos.side === "LONG" ? fill - pos.entryFill : pos.entryFill - fill) * pos.quantity - fill * pos.quantity * fee;
  };
  const closePosition = (rawPrice, i, reason, ambiguous = false) => {
    const pos = position, closeSide = pos.side === "LONG" ? "SELL" : "BUY";
    const exitFill = rawPrice * (1 + (closeSide === "BUY" ? 1 : -1) * slip);
    const exitFee = exitFill * pos.quantity * fee;
    const gross = (pos.side === "LONG" ? exitFill - pos.entryFill : pos.entryFill - exitFill) * pos.quantity;
    const net = gross - pos.entryFee - exitFee;
    equity += gross - exitFee;
    const plannedRisk = Math.abs(pos.entryFill - pos.stop) * pos.quantity;
    trades.push({
      side: pos.side, signalTime: pos.signal.signalTime, entryTime: mainCandles[pos.entryIndex].time, exitTime: mainCandles[i].time,
      signalPrice: pos.signal.entryReference, entryPrice: Number(pos.entryFill.toFixed(8)), stopPrice: Number(pos.stop.toFixed(8)),
      targetPrice: Number(pos.target.toFixed(8)), quantity: Number(pos.quantity.toFixed(8)),
      notional: Number((pos.entryFill * pos.quantity).toFixed(8)), plannedRisk: Number(plannedRisk.toFixed(8)),
      grossPnl: Number(gross.toFixed(8)), fees: Number((pos.entryFee + exitFee).toFixed(8)),
      netPnl: Number(net.toFixed(8)), netR: plannedRisk > 0 ? Number((net / plannedRisk).toFixed(4)) : null,
      exitReason: reason, ambiguousStopFirst: ambiguous, higherTrend: pos.signal.higherTrend,
      rsiAtSignal: Number(pos.signal.rsi.toFixed(2)), longScore: pos.signal.longScore, shortScore: pos.signal.shortScore,
      equityAfter: Number(equity.toFixed(8))
    });
    if (reason.includes("STOP")) stopExits++; else if (reason.startsWith("TARGET")) targetExits++; else if (reason === "WINDOW_END") windowEndCloses++;
    if (ambiguous) ambiguousExits++;
    updateDD(equity); position = null;
  };

  for (let i = from; i < end; i++) {
    const bar = mainCandles[i];
    if (position && i >= position.entryIndex) {
      const p = position;
      const stopHit = p.side === "LONG" ? bar.low <= p.stop : bar.high >= p.stop;
      const targetHit = p.side === "LONG" ? bar.high >= p.target : bar.low <= p.target;
      let exit = null, reason = "", ambiguous = false;
      if (p.side === "LONG" && bar.open <= p.stop) { exit = bar.open; reason = "GAP_STOP"; }
      else if (p.side === "SHORT" && bar.open >= p.stop) { exit = bar.open; reason = "GAP_STOP"; }
      else if (p.side === "LONG" && bar.open >= p.target) { exit = p.target; reason = "TARGET_GAP"; }
      else if (p.side === "SHORT" && bar.open <= p.target) { exit = p.target; reason = "TARGET_GAP"; }
      else if (stopHit && targetHit) { exit = p.stop; reason = "STOP_AMBIGUOUS"; ambiguous = true; }
      else if (stopHit) { exit = p.stop; reason = "STOP"; }
      else if (targetHit) { exit = p.target; reason = "TARGET"; }
      if (exit !== null) {
        if (reason === "TARGET") updateDD(hypotheticalEquity(p.side === "LONG" ? bar.low : bar.high, p));
        else updateDD(hypotheticalEquity(exit, p));
        closePosition(exit, i, reason, ambiguous);
      } else updateDD(hypotheticalEquity(p.side === "LONG" ? bar.low : bar.high, p));
    }
    if (position || i < signalFrom || i < MIN_SIGNAL_HISTORY - 1 || i >= end - 1) continue;
    const evaluated = signalAt(mainCandles, higherCandles, i, ind);
    signalsEvaluated++;
    if (!evaluated.signal) continue;
    qualifiedSignals++;
    const s = evaluated.signal, next = mainCandles[i + 1];
    const drift = Math.abs(next.open - s.entryReference) / s.entryReference;
    if (!Number.isFinite(drift) || drift > maxDriftPct / 100) { driftSkips++; continue; }
    const long = s.side === "LONG";
    if ((long && next.open <= s.stop) || (!long && next.open >= s.stop)) { invalidatedSkips++; continue; }
    const target = long ? next.open + 2 * Math.abs(next.open - s.stop) : next.open - 2 * Math.abs(next.open - s.stop);
    const entryFill = next.open * (1 + (long ? 1 : -1) * slip);
    if (!Number.isFinite(entryFill) || entryFill <= 0 || (long ? !(s.stop < entryFill && target > entryFill) : !(target < entryFill && entryFill < s.stop))) { invalidatedSkips++; continue; }
    const riskBudget = equity * riskPct / 100;
    const quantity = Math.min(riskBudget / Math.abs(entryFill - s.stop), equity * maxPositionPct / 100 / entryFill, equity * maxPortfolioPct / 100 / entryFill);
    const epsilon = Math.max(1e-8, equity * 1e-10);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity * Math.abs(entryFill - s.stop) > riskBudget + epsilon ||
        quantity * entryFill > equity * maxPositionPct / 100 + epsilon || quantity * entryFill > equity * maxPortfolioPct / 100 + epsilon) { sizingSkips++; continue; }
    const entryFee = entryFill * quantity * fee;
    equity -= entryFee;
    position = { side: s.side, signal: s, entryIndex: i + 1, entryFill, stop: s.stop, target, quantity, entryFee };
    updateDD(equity);
  }
  if (position && end > from) closePosition(mainCandles[end - 1].close, end - 1, "WINDOW_END");

  const netPnl = equity - initialBalance, wins = trades.filter((t) => t.netPnl > 0), losses = trades.filter((t) => t.netPnl < 0);
  const totalWins = wins.reduce((sum, t) => sum + t.netPnl, 0), totalLosses = -losses.reduce((sum, t) => sum + t.netPnl, 0);
  const first = mainCandles[from], last = mainCandles[end - 1], holdEntry = first.open * (1 + slip), holdExit = last.close * (1 - slip);
  const buyHold = (holdExit / holdEntry - 1 - fee * (1 + holdExit / holdEntry)) * 100;
  const warnings = [];
  if (trades.length < 30) warnings.push("Fewer than 30 closed trades: performance statistics are highly uncertain.");
  if (trades.length < 100) warnings.push("Fewer than 100 closed trades: do not treat this segment as evidence of a robust edge.");
  if (!trades.length) warnings.push("No trades qualified in this segment; no strategy edge is demonstrated.");
  if (ambiguousExits) warnings.push("Ambiguous OHLC bars touching stop and target were conservatively counted as stop exits.");
  warnings.push("OHLC-only research cannot reconstruct historical bid/ask, funding, market impact, latency or liquidation. It is not a live-execution result.");
  return {
    available: true, initialBalance, endingBalance: Number(equity.toFixed(8)), netPnl: Number(netPnl.toFixed(8)),
    netReturnPct: Number((netPnl / initialBalance * 100).toFixed(4)), buyHoldReturnPct: Number(buyHold.toFixed(4)),
    closedTrades: trades.length, signalsEvaluated, qualifiedSignals, openedTrades: trades.length,
    skippedEntryDrift: driftSkips, skippedInvalidatedAtOpen: invalidatedSkips, skippedSizing: sizingSkips,
    stopExits, targetExits, windowEndCloses, ambiguousStopFirstExits: ambiguousExits,
    winRatePct: trades.length ? Number((wins.length / trades.length * 100).toFixed(2)) : 0,
    profitFactor: totalLosses > 0 ? Number((totalWins / totalLosses).toFixed(3)) : totalWins > 0 ? null : 0,
    averageTradePnl: trades.length ? Number((netPnl / trades.length).toFixed(8)) : 0,
    averageR: trades.length ? Number((trades.reduce((sum, t) => sum + (t.netR || 0), 0) / trades.length).toFixed(4)) : 0,
    maxDrawdownPct: Number((maxDD * 100).toFixed(4)), recentTrades: trades.slice(-20), warnings,
    assumptions: {
      signal: "Closed-candle EMA 9/21/50, RSI 14 bands, directional momentum, 20-bar breakout/breakdown and aligned higher-timeframe EMA 20/50",
      entry: "Next candle open; skip entries more than 1% from signal close or after stop invalidation",
      target: "2R from next-open entry reference to the signal-derived stop",
      ambiguousBar: "Stop-first if stop and target are both touched inside one OHLC candle",
      sizing: "Unlevered, one position at a time; 0.1–1% equity risk, 5% per-position and 20% portfolio notional caps",
      costs: "Adverse per-side slippage and fees; historic bid/ask spread and funding are unavailable",
      lookahead: "Main indicators use data through the closed signal candle; higher timeframe uses only candles closed by then"
    }
  };
}
