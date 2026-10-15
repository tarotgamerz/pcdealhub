import { validateBacktestCandles } from "./trading-backtest.mjs";
import strategyEnsemble from "../public/strategy-ensemble.js";
const { evaluateStrategyEnsemble } = strategyEnsemble;

const MIN_SIGNAL_HISTORY = 80;
const HTF_LOOKBACK = 180;

function validateCandleSeries(candles, label) {
  validateBacktestCandles(candles);
  if (candles.some((c) => !Number.isFinite(c.closeTime) || c.closeTime <= c.time || !Number.isFinite(c.volume) || c.volume < 0)) {
    throw new Error(label + " candles require closeTime after open time and a finite non-negative volume");
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

function signalAtEnsemble(candles, higher, i, ind) {
  if (i < MIN_SIGNAL_HISTORY - 1 || i >= candles.length) return { signal: null, reason: "WARMUP" };
  const last = candles[i], av = ind.atr[i], rv = ind.rsi[i];
  if (!Number.isFinite(av) || av <= 0 || !Number.isFinite(rv)) return { signal: null, reason: "INDICATORS_UNAVAILABLE" };
  // Evaluate only the history available at this signal candle; never pass future candles to the ensemble.
  const htf = trendAt(higher, last.closeTime);
  const htfDirection = !htf.ready ? "UNAVAILABLE" : htf.up ? "BULLISH" : htf.down ? "BEARISH" : "MIXED";
  const vote = evaluateStrategyEnsemble({
    candles: candles.slice(0, i + 1),
    higherTrend: htfDirection,
    fresh: true
  });
  if (vote.bias !== "LONG" && vote.bias !== "SHORT") {
    return { signal: null, reason: vote.status === "WAIT" ? "ENSEMBLE_DATA_GATE" : "NO_ENSEMBLE_AGREEMENT", ensemble: vote };
  }
  const side = vote.bias;
  const recent = candles.slice(Math.max(0, i - 7), i + 1);
  const entry = last.close;
  const stop = side === "LONG"
    ? Math.min(entry - av * 1.5, Math.min(...recent.map((c) => c.low)) - av * 0.1)
    : Math.max(entry + av * 1.5, Math.max(...recent.map((c) => c.high)) + av * 0.1);
  if (!Number.isFinite(stop) || stop <= 0 || (side === "LONG" ? stop >= entry : stop <= entry)) {
    return { signal: null, reason: "INVALID_STOP", ensemble: vote };
  }
  const risk = Math.abs(entry - stop);
  return {
    reason: "ENSEMBLE_AGREEMENT",
    ensemble: vote,
    signal: {
      strategyMode: "strategy-ensemble",
      side,
      signalIndex: i,
      signalTime: last.time,
      signalCloseTime: last.closeTime,
      entryReference: entry,
      stop,
      target: side === "LONG" ? entry + risk * 2 : entry - risk * 2,
      atr: av,
      rsi: rv,
      longScore: vote.longVotes,
      shortScore: vote.shortVotes,
      higherTrend: htf.direction,
      ensembleRegime: vote.regime,
      ensembleVotes: {
        trend: vote.strategies.trend.bias,
        breakout: vote.strategies.breakout.bias,
        meanReversion: vote.strategies.meanReversion.bias
      }
    }
  };
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
  const strategyMode = String(options.strategyMode ?? "live-agent-rules");
  if (!["live-agent-rules", "strategy-ensemble"].includes(strategyMode)) throw new Error("Unsupported backtest strategy mode");
  const rawFrom = Number(options.fromIndex ?? MIN_SIGNAL_HISTORY - 1);
  const rawEnd = Number(options.endIndex ?? mainCandles.length);
  const rawSignalFrom = Number(options.signalStartIndex ?? rawFrom);
  if (![rawFrom, rawEnd, rawSignalFrom].every(Number.isFinite)) throw new Error("Invalid chronological segment indices");
  const from = Math.min(mainCandles.length, Math.max(0, Math.floor(rawFrom)));
  const end = Math.min(mainCandles.length, Math.max(0, Math.floor(rawEnd)));
  const signalFrom = Math.min(mainCandles.length, Math.max(from, Math.floor(rawSignalFrom)));
  if (![initialBalance, riskPct, feeBps, slippageBps, maxPositionPct, maxPortfolioPct, maxDriftPct].every(Number.isFinite) ||
      initialBalance < 100 || initialBalance > 10000000 || riskPct < 0.1 || riskPct > 1 ||
      feeBps < 0 || feeBps > 50 || slippageBps < 0 || slippageBps > 50 ||
      maxPositionPct <= 0 || maxPositionPct > 5 || maxPortfolioPct <= 0 || maxPortfolioPct > 20 ||
      maxDriftPct < 0 || maxDriftPct > 5) throw new Error("Invalid live-agent backtest settings");
  if (end - from < 2 || signalFrom >= end) return {
    available: false, strategyMode, reason: "Not enough candles in this chronological segment.", initialBalance, endingBalance: initialBalance,
    netPnl: 0, netReturnPct: 0, buyHoldReturnPct: 0, closedTrades: 0, signalsEvaluated: 0, qualifiedSignals: 0,
    openedTrades: 0, skippedEntryDrift: 0, skippedInvalidatedAtOpen: 0, skippedSizing: 0,
    stopExits: 0, targetExits: 0, windowEndCloses: 0, ambiguousStopFirstExits: 0,
    winRatePct: 0, profitFactor: 0, averageTradePnl: 0, averageR: 0, maxDrawdownPct: 0, recentTrades: [],
    warnings: ["No performance claim is made from an empty sample."]
  };

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
      side: pos.side, strategyMode: pos.signal.strategyMode || "live-agent-rules", signalTime: pos.signal.signalTime, entryTime: mainCandles[pos.entryIndex].time, exitTime: mainCandles[i].time,
      signalPrice: pos.signal.entryReference, entryPrice: Number(pos.entryFill.toFixed(8)), exitPrice: Number(exitFill.toFixed(8)), stopPrice: Number(pos.stop.toFixed(8)),
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
    const evaluated = strategyMode === "strategy-ensemble"
      ? signalAtEnsemble(mainCandles, higherCandles, i, ind)
      : signalAt(mainCandles, higherCandles, i, ind);
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
  if (strategyMode === "strategy-ensemble") warnings.push("Ensemble vote agreement is a deterministic rule result, not a calibrated probability or evidence of profitability.");
  return {
    available: true, strategyMode, initialBalance, endingBalance: Number(equity.toFixed(8)), netPnl: Number(netPnl.toFixed(8)),
    netReturnPct: Number((netPnl / initialBalance * 100).toFixed(4)), buyHoldReturnPct: Number(buyHold.toFixed(4)),
    closedTrades: trades.length, signalsEvaluated, qualifiedSignals, openedTrades: trades.length,
    skippedEntryDrift: driftSkips, skippedInvalidatedAtOpen: invalidatedSkips, skippedSizing: sizingSkips,
    stopExits, targetExits, windowEndCloses, ambiguousStopFirstExits: ambiguousExits,
    winningTrades: wins.length, losingTrades: losses.length,
    grossProfit: Number(totalWins.toFixed(8)), grossLoss: Number(totalLosses.toFixed(8)),
    totalFees: Number(trades.reduce((sum, trade) => sum + trade.fees, 0).toFixed(8)),
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


function aggregateWalkForwardRuns(runs, initialBalance) {
  const closedTrades = runs.reduce((sum, run) => sum + Number(run.closedTrades || 0), 0);
  const winningTrades = runs.reduce((sum, run) => sum + Number(run.winningTrades || 0), 0);
  const losingTrades = runs.reduce((sum, run) => sum + Number(run.losingTrades || 0), 0);
  const grossProfit = runs.reduce((sum, run) => sum + Number(run.grossProfit || 0), 0);
  const grossLoss = runs.reduce((sum, run) => sum + Number(run.grossLoss || 0), 0);
  const totalFees = runs.reduce((sum, run) => sum + Number(run.totalFees || 0), 0);
  const meanFoldReturnPct = runs.length
    ? runs.reduce((sum, run) => sum + Number(run.netReturnPct || 0), 0) / runs.length : 0;
  const positiveFolds = runs.filter((run) => Number(run.netReturnPct || 0) > 0).length;
  const worstFoldDrawdownPct = runs.length
    ? Math.max(...runs.map((run) => Number(run.maxDrawdownPct || 0))) : 0;
  const netPnlWithBalanceReset = runs.reduce((sum, run) => sum + Number(run.netPnl || 0), 0);
  const warnings = [];
  if (closedTrades < 30) warnings.push("Fewer than 30 out-of-sample closed trades across folds: results are highly uncertain.");
  if (closedTrades < 100) warnings.push("Fewer than 100 out-of-sample closed trades: do not treat the fold aggregate as evidence of a robust edge.");
  if (runs.some((run) => !run.available)) warnings.push("One or more chronological folds were unavailable; the comparison is incomplete.");
  warnings.push("The P&L total adds segments that each reset to the same starting balance; it is not a continuous compounded-account result.");
  warnings.push("Maximum drawdown is the worst individual fold drawdown; drawdown across a continuous live account may differ.");
  return {
    available: runs.length > 0 && runs.every((run) => run.available),
    foldCount: runs.length,
    initialBalancePerFold: initialBalance,
    closedTrades,
    winningTrades,
    losingTrades,
    meanFoldReturnPct: Number(meanFoldReturnPct.toFixed(4)),
    positiveFolds,
    sumSegmentNetPnlUSDT: Number(netPnlWithBalanceReset.toFixed(8)),
    totalFeesUSDT: Number(totalFees.toFixed(8)),
    winRatePct: closedTrades ? Number((winningTrades / closedTrades * 100).toFixed(2)) : 0,
    profitFactor: grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(3)) : grossProfit > 0 ? null : 0,
    worstFoldDrawdownPct: Number(worstFoldDrawdownPct.toFixed(4)),
    warnings
  };
}

/**
 * Compares frozen strategies on sequential out-of-sample folds.
 * The first 55% supplies historical context, 55–85% is split into
 * three non-overlapping walk-forward folds, and the last 15% is scored
 * separately as the final chronological segment. No parameters are tuned.
 */
export function runWalkForwardStrategyComparison(mainCandles, higherCandles, options = {}) {
  validateCandleSeries(mainCandles, "Main timeframe");
  validateCandleSeries(higherCandles, "Higher timeframe");
  const initialBalance = Number(options.initialBalance ?? 10000);
  const riskPct = Number(options.riskPct ?? 0.5);
  const feeBps = Number(options.feeBps ?? 5);
  const slippageBps = Number(options.slippageBps ?? 2);
  const maxPositionExposurePct = Number(options.maxPositionExposurePct ?? 5);
  const maxPortfolioExposurePct = Number(options.maxPortfolioExposurePct ?? 20);
  const maxEntryDriftPct = Number(options.maxEntryDriftPct ?? 1);
  const minimumHistory = 400;
  if (![initialBalance, riskPct, feeBps, slippageBps, maxPositionExposurePct, maxPortfolioExposurePct, maxEntryDriftPct].every(Number.isFinite) ||
      initialBalance < 100 || initialBalance > 10000000 || riskPct < 0.1 || riskPct > 1 ||
      feeBps < 0 || feeBps > 50 || slippageBps < 0 || slippageBps > 50 ||
      maxPositionExposurePct <= 0 || maxPositionExposurePct > 5 ||
      maxPortfolioExposurePct <= 0 || maxPortfolioExposurePct > 20 ||
      maxEntryDriftPct < 0 || maxEntryDriftPct > 5) {
    throw new Error("Invalid walk-forward comparison settings");
  }
  const n = mainCandles.length;
  if (n < minimumHistory) {
    return {
      available: false,
      reason: "Walk-forward comparison needs at least " + minimumHistory + " closed main-timeframe candles; only " + n + " were supplied.",
      minimumHistory,
      candles: n,
      mode: "RESEARCH_ONLY_NO_ORDERS"
    };
  }

  const contextEnd = Math.floor(n * 0.55);
  const walkForwardEnd = Math.floor(n * 0.85);
  const totalOosBars = walkForwardEnd - contextEnd;
  if (contextEnd < MIN_SIGNAL_HISTORY || totalOosBars < 6 || n - walkForwardEnd < 2) {
    return { available: false, reason: "Insufficient candle count for the required chronological folds.", minimumHistory, candles: n, mode: "RESEARCH_ONLY_NO_ORDERS" };
  }

  const common = {
    initialBalance, riskPct, feeBps, slippageBps,
    maxPositionExposurePct, maxPortfolioExposurePct, maxEntryDriftPct
  };
  const folds = [];
  const foldCount = 3;
  for (let foldIndex = 0; foldIndex < foldCount; foldIndex++) {
    const fromIndex = contextEnd + Math.floor(totalOosBars * foldIndex / foldCount);
    const endIndex = contextEnd + Math.floor(totalOosBars * (foldIndex + 1) / foldCount);
    const baseline = runLiveAgentStrategyBacktest(mainCandles, higherCandles, {
      ...common, fromIndex, endIndex, signalStartIndex: fromIndex, strategyMode: "live-agent-rules"
    });
    const ensemble = runLiveAgentStrategyBacktest(mainCandles, higherCandles, {
      ...common, fromIndex, endIndex, signalStartIndex: fromIndex, strategyMode: "strategy-ensemble"
    });
    folds.push({
      fold: foldIndex + 1,
      fromIndex,
      endIndex,
      firstTestCandleTime: mainCandles[fromIndex]?.time ?? null,
      lastTestCandleTime: mainCandles[Math.max(fromIndex, endIndex - 1)]?.time ?? null,
      liveAgentRules: baseline,
      ensemble
    });
  }

  const finalFrom = walkForwardEnd;
  const finalHoldout = {
    fromIndex: finalFrom,
    endIndex: n,
    firstTestCandleTime: mainCandles[finalFrom]?.time ?? null,
    lastTestCandleTime: mainCandles[n - 1]?.time ?? null,
    liveAgentRules: runLiveAgentStrategyBacktest(mainCandles, higherCandles, {
      ...common, fromIndex: finalFrom, endIndex: n, signalStartIndex: finalFrom, strategyMode: "live-agent-rules"
    }),
    ensemble: runLiveAgentStrategyBacktest(mainCandles, higherCandles, {
      ...common, fromIndex: finalFrom, endIndex: n, signalStartIndex: finalFrom, strategyMode: "strategy-ensemble"
    })
  };
  const liveAgentAggregate = aggregateWalkForwardRuns(folds.map((fold) => fold.liveAgentRules), initialBalance);
  const ensembleAggregate = aggregateWalkForwardRuns(folds.map((fold) => fold.ensemble), initialBalance);
  const returnDelta = Number((ensembleAggregate.meanFoldReturnPct - liveAgentAggregate.meanFoldReturnPct).toFixed(4));
  const drawdownDelta = Number((ensembleAggregate.worstFoldDrawdownPct - liveAgentAggregate.worstFoldDrawdownPct).toFixed(4));
  let verdict;
  if (!liveAgentAggregate.available || !ensembleAggregate.available ||
      ensembleAggregate.closedTrades < 100 || liveAgentAggregate.closedTrades < 100) {
    verdict = "INCONCLUSIVE_LOW_SAMPLE";
  } else if (returnDelta > 0 && drawdownDelta <= 0) {
    verdict = "PROMISING_NOT_VALIDATED";
  } else {
    verdict = "ENSEMBLE_NOT_BETTER_IN_THIS_SAMPLE";
  }

  return {
    available: true,
    mode: "RESEARCH_ONLY_NO_ORDERS",
    method: "Frozen rules; first 55% historical context, three non-overlapping walk-forward folds over 55–85%, and a separately scored final 15% chronological segment. No parameters are optimized by this evaluation.",
    sample: { totalClosedCandles: n, contextEndIndex: contextEnd, walkForwardEndIndex: walkForwardEnd, finalHoldoutStartIndex: finalFrom },
    assumptions: {
      startingBalancePerSegmentUSDT: initialBalance,
      riskPctPerTrade: riskPct,
      feeBpsPerSide: feeBps,
      slippageBpsPerSide: slippageBps,
      maxPositionNotionalPct: maxPositionExposurePct,
      maxPortfolioNotionalPct: maxPortfolioExposurePct,
      maxEntryDriftPct,
      entry: "Next candle open after a closed-candle signal; entries beyond the drift cap are skipped",
      exit: "Signal-derived stop, 2R target, conservative stop-first when stop and target are both touched within one OHLC candle",
      costs: "Adverse entry and exit slippage plus entry and exit fees; funding, historical spread, market impact, latency and liquidation are not simulated",
      higherTimeframe: "Only higher-timeframe candles closed by the signal candle close are eligible",
      continuousCapital: "Each fold starts with the same simulated balance; aggregates report mean fold return and reset-balance P&L, not a compounded continuous account"
    },
    liveAgentRules: { strategyMode: "live-agent-rules", walkForward: liveAgentAggregate },
    ensemble: { strategyMode: "strategy-ensemble", walkForward: ensembleAggregate },
    folds,
    finalHoldout,
    comparison: {
      verdict,
      meanFoldReturnDeltaPctPoints: returnDelta,
      worstFoldDrawdownDeltaPctPoints: drawdownDelta,
      minimumTradesPerStrategyForScreen: 100,
      automatedPromotionAllowed: false,
      note: verdict === "PROMISING_NOT_VALIDATED"
        ? "The ensemble passed a preliminary screen only; retain shadow mode and require additional unseen data plus forward paper trading."
        : verdict === "ENSEMBLE_NOT_BETTER_IN_THIS_SAMPLE"
          ? "The ensemble did not outperform on both average fold return and worst-fold drawdown. Do not promote it."
          : "Trade count or sample quality is insufficient to decide. No strategy should be promoted based on this result."
    },
    warnings: [
      "This is a frozen-rule walk-forward comparison, not DRL training and not proof of profitability.",
      "Inspecting this final chronological segment consumes its untouched status; freeze all strategy decisions before using it as a final release gate.",
      "A small number of candles or trades can produce misleading metrics. Repeat across multiple symbols, timeframes, regimes and longer history.",
      "Historical OHLCV cannot faithfully reconstruct spread, funding, liquidation, partial fills or market impact. Live results can differ materially."
    ]
  };
}

