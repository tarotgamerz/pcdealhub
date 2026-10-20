const INTERVAL_MS = { "1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000 };

export function validateBacktestCandles(candles) {
  if (!Array.isArray(candles) || candles.length < 3) throw new Error("At least three candles are required");
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (!c || ![c.time, c.open, c.high, c.low, c.close].every(Number.isFinite) ||
      c.time <= 0 || c.open <= 0 || c.low <= 0 || c.close <= 0 ||
      c.high < Math.max(c.open, c.low, c.close) || c.low > Math.min(c.open, c.high, c.close)) {
      throw new Error("Malformed OHLC candle rejected");
    }
    if (Number.isFinite(c.closeTime) && c.closeTime < c.time) throw new Error("Candle close time precedes open time");
    if (i > 0 && c.time <= candles[i - 1].time) throw new Error("Candles must be strictly chronological");
  }
  return true;
}

/**
 * Validates realized funding events fetched from an exchange. Each event uses
 * the exchange funding timestamp, realized rate, and mark price at settlement.
 */
export function validateFundingRates(fundingRates) {
  if (!Array.isArray(fundingRates)) throw new Error("Funding history must be an array");
  let previousTime = 0;
  return fundingRates.map((event) => {
    const time = Number(event?.time);
    const rate = Number(event?.rate);
    const markPrice = Number(event?.markPrice);
    if (!Number.isFinite(time) || time <= 0 ||
        !Number.isFinite(rate) ||
        !Number.isFinite(markPrice) || markPrice <= 0) {
      throw new Error("Malformed funding-rate event rejected");
    }
    if (time <= previousTime) throw new Error("Funding events must be strictly chronological and unique");
    previousTime = time;
    return { time, rate, markPrice };
  });
}

/** Funding PnL as a fraction of entry notional/equity for an unlevered linear perp. */
export function calculateFundingPnlFraction(side, fundingRate, markPrice, entryPrice) {
  if (!["LONG", "SHORT"].includes(side) ||
      ![fundingRate, markPrice, entryPrice].every(Number.isFinite) ||
      markPrice <= 0 || entryPrice <= 0) {
    throw new Error("Invalid funding-PnL inputs");
  }
  // A positive funding rate is paid by longs and received by shorts; negative
  // rates reverse the transfer. Mark-price notional scales the transfer.
  return -(side === "LONG" ? 1 : -1) * fundingRate * markPrice / entryPrice;
}

export function calculateSma(values, period) {
  if (!Array.isArray(values) || !Number.isInteger(period) || period < 1) throw new Error("Invalid SMA inputs");
  const out = Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function summarizeTrades(trades, equity, maxDrawdown, closedTradeMaxDrawdown, candles, startIndex, endIndex, feeRate, slipRate, fundingRates, fundingCostsIncluded) {
  const wins = trades.filter(t => t.netReturnPct > 0);
  const losses = trades.filter(t => t.netReturnPct < 0);
  const grossWins = wins.reduce((sum, t) => sum + t.netReturnPct, 0);
  const grossLosses = -losses.reduce((sum, t) => sum + t.netReturnPct, 0);
  const first = candles[Math.min(startIndex, candles.length - 1)];
  const last = candles[Math.max(Math.min(endIndex, candles.length) - 1, 0)];
  let buyHoldReturnPct = null;
  let buyHoldFundingPnlPct = null;
  if (first && last && last.time >= first.time) {
    const entryFill = first.open * (1 + slipRate);
    const exitFill = last.close * (1 - slipRate);
    const fundingEvents = fundingCostsIncluded
      ? fundingRates.filter(event => event.time > first.time && event.time <= (Number.isFinite(last.closeTime) ? last.closeTime : last.time))
      : [];
    const fundingPnl = fundingEvents.reduce((sum, event) =>
      sum + calculateFundingPnlFraction("LONG", event.rate, event.markPrice, entryFill), 0);
    const priceAndFeeReturn = entryFill > 0
      ? (exitFill / entryFill - 1) - feeRate * (1 + exitFill / entryFill)
      : 0;
    buyHoldFundingPnlPct = Number((fundingPnl * 100).toFixed(4));
    buyHoldReturnPct = (priceAndFeeReturn + fundingPnl) * 100;
  }
  return {
    equityCurve: trades.slice(-200).map(t => ({ time: t.exitTime, equity: Number(t.equityAfter.toFixed(6)) })),
    netReturnPct: Number(((equity - 1) * 100).toFixed(3)),
    buyHoldReturnPct: Number((buyHoldReturnPct ?? 0).toFixed(3)),
    buyHoldFundingPnlPct,
    closedTrades: trades.length,
    winRatePct: trades.length ? Number((wins.length / trades.length * 100).toFixed(2)) : 0,
    profitFactor: grossLosses > 0 ? Number((grossWins / grossLosses).toFixed(3)) : (grossWins > 0 ? null : 0),
    averageTradePct: trades.length ? Number((trades.reduce((s, t) => s + t.netReturnPct, 0) / trades.length).toFixed(4)) : 0,
    averageWinnerPct: wins.length ? Number((grossWins / wins.length).toFixed(4)) : 0,
    averageLoserPct: losses.length ? Number((-grossLosses / losses.length).toFixed(4)) : 0,
    maxDrawdownPct: Number((maxDrawdown * 100).toFixed(3)),
    closedTradeMaxDrawdownPct: Number((closedTradeMaxDrawdown * 100).toFixed(3)),
    fundingCostsIncluded,
    fundingPnlPctSum: Number(trades.reduce((sum, trade) => sum + (trade.fundingPnlPct || 0), 0).toFixed(4)),
    fundingEventsCharged: trades.reduce((sum, trade) => sum + (trade.fundingEventsCharged || 0), 0),
    drawdownMethod: "Mark-to-market estimate using adverse candle highs/lows, adverse exit slippage, entry/exit fees, and funding transfers at reported settlement marks; OHLC cannot reveal the full intrabar path.",
    firstCandleTime: first?.time ?? null,
    lastCandleTime: last?.time ?? null,
    recentTrades: trades.slice(-20).map(t => ({
      side: t.side, entryTime: t.entryTime, exitTime: t.exitTime,
      entryPrice: Number(t.entryPrice.toFixed(6)), exitPrice: Number(t.exitPrice.toFixed(6)),
      netReturnPct: Number(t.netReturnPct.toFixed(4)),
      fundingPnlPct: Number((t.fundingPnlPct || 0).toFixed(4)),
      fundingEventsCharged: t.fundingEventsCharged || 0,
      exitReason: t.exitReason
    }))
  };
}

export function runSmaCrossoverBacktest(candles, {
  fastPeriod = 9, slowPeriod = 21, feeBps = 5, slippageBps = 2,
  startIndex = null, endIndex = null, fundingRates = null
} = {}) {
  validateBacktestCandles(candles);
  if (!Number.isInteger(fastPeriod) || !Number.isInteger(slowPeriod) || fastPeriod < 2 || slowPeriod <= fastPeriod || slowPeriod > 100) {
    throw new Error("Require integer periods with 2 <= fastPeriod < slowPeriod <= 100");
  }
  if (![feeBps, slippageBps].every(Number.isFinite) || feeBps < 0 || feeBps > 50 || slippageBps < 0 || slippageBps > 50) {
    throw new Error("Fees and slippage must be between 0 and 50 basis points per side");
  }
  const fundingCostsIncluded = Array.isArray(fundingRates);
  const validatedFundingRates = fundingCostsIncluded ? validateFundingRates(fundingRates) : [];
  const start = startIndex == null ? slowPeriod : Math.max(slowPeriod, Math.floor(startIndex));
  const end = endIndex == null ? candles.length : Math.min(candles.length, Math.floor(endIndex));
  if (start < 0 || end - start < 3) throw new Error("Not enough candles in this backtest window");

  const closes = candles.map(c => c.close);
  const fast = calculateSma(closes, fastPeriod);
  const slow = calculateSma(closes, slowPeriod);
  const feeRate = feeBps / 10_000;
  const slipRate = slippageBps / 10_000;
  let side = 0, entryFill = 0, entryTime = 0, positionEntryEquity = 0, equity = 1, peak = 1, maxDrawdown = 0;
  let positionFundingPnl = 0, positionFundingEvents = 0, fundingIndex = 0;
  let closedTradePeak = 1, closedTradeMaxDrawdown = 0;
  const trades = [];

  const updateDrawdownAtEquity = (markedEquity) => {
    peak = Math.max(peak, markedEquity);
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - markedEquity) / peak);
  };

  // Funding events at an exit boundary are charged to the previous position;
  // events exactly at an entry boundary are excluded because settlement/order
  // sequencing cannot be reconstructed reliably from OHLC bars.
  const applyFundingThrough = (timestamp) => {
    if (!fundingCostsIncluded) return;
    while (fundingIndex < validatedFundingRates.length && validatedFundingRates[fundingIndex].time <= timestamp) {
      const event = validatedFundingRates[fundingIndex++];
      if (!side || event.time <= entryTime) continue;
      positionFundingPnl += calculateFundingPnlFraction(side === 1 ? "LONG" : "SHORT", event.rate, event.markPrice, entryFill);
      positionFundingEvents += 1;
      const priceReturnAtFunding = side * (event.markPrice / entryFill - 1);
      const feeReturnAtFunding = feeRate * (1 + event.markPrice / entryFill);
      const markedEquity = positionEntryEquity * Math.max(0, 1 + priceReturnAtFunding - feeReturnAtFunding + positionFundingPnl);
      updateDrawdownAtEquity(markedEquity);
    }
  };

  const closePosition = (marketPrice, time, reason) => {
    if (!side) return;
    applyFundingThrough(time);
    const exitFill = marketPrice * (1 - side * slipRate);
    const grossReturn = side * (exitFill / entryFill - 1);
    const feeReturn = feeRate * (1 + exitFill / entryFill);
    const netReturn = grossReturn - feeReturn + positionFundingPnl;
    trades.push({
      side: side === 1 ? "LONG" : "SHORT",
      entryTime, exitTime: time, entryPrice: entryFill, exitPrice: exitFill,
      netReturnPct: netReturn * 100, fundingPnlPct: positionFundingPnl * 100,
      fundingEventsCharged: positionFundingEvents, exitReason: reason
    });
    equity *= Math.max(0, 1 + netReturn);
    trades[trades.length - 1].equityAfter = equity;
    closedTradePeak = Math.max(closedTradePeak, equity);
    if (closedTradePeak > 0) closedTradeMaxDrawdown = Math.max(closedTradeMaxDrawdown, (closedTradePeak - equity) / closedTradePeak);
    updateDrawdownAtEquity(equity);
    side = 0; entryFill = 0; entryTime = 0; positionEntryEquity = 0;
    positionFundingPnl = 0; positionFundingEvents = 0;
  };

  // Drawdown uses closed candles' adverse extremes and only funding known by
  // that candle's time. This is still an OHLC estimate, not tick-level replay.
  const markIntratradeDrawdown = (candle) => {
    if (!candle) return;
    applyFundingThrough(candle.time);
    if (!side) return;
    const markedEquity = (marketPrice) => {
      const hypotheticalExitFill = marketPrice * (1 - side * slipRate);
      const grossReturn = side * (hypotheticalExitFill / entryFill - 1);
      const feeReturn = feeRate * (1 + hypotheticalExitFill / entryFill);
      return positionEntryEquity * Math.max(0, 1 + grossReturn - feeReturn + positionFundingPnl);
    };
    const favorablePrice = side === 1 ? candle.high : candle.low;
    const adversePrice = side === 1 ? candle.low : candle.high;
    updateDrawdownAtEquity(markedEquity(favorablePrice));
    updateDrawdownAtEquity(markedEquity(adversePrice));
  };

  // A signal is known only after candle i closes, so every entry/exit executes
  // at candle i+1's open. This deliberately avoids same-close look-ahead fills.
  for (let i = start; i < end - 1; i++) {
    markIntratradeDrawdown(candles[i]);
    if (fast[i] == null || slow[i] == null || fast[i - 1] == null || slow[i - 1] == null) continue;
    const crossedUp = fast[i - 1] <= slow[i - 1] && fast[i] > slow[i];
    const crossedDown = fast[i - 1] >= slow[i - 1] && fast[i] < slow[i];
    if (!crossedUp && !crossedDown) continue;
    const desired = crossedUp ? 1 : -1;
    if (desired === side) continue;
    const fillCandle = candles[i + 1];
    closePosition(fillCandle.open, fillCandle.time, "SIGNAL_REVERSAL");
    side = desired;
    entryFill = fillCandle.open * (1 + side * slipRate);
    entryTime = fillCandle.time;
    positionEntryEquity = equity;
    positionFundingPnl = 0;
    positionFundingEvents = 0;
  }
  const last = candles[end - 1];
  markIntratradeDrawdown(last);
  const lastExitTime = Number.isFinite(last.closeTime) ? last.closeTime : last.time;
  closePosition(last.close, lastExitTime, "WINDOW_END");
  return summarizeTrades(trades, equity, maxDrawdown, closedTradeMaxDrawdown, candles, start, end, feeRate, slipRate, validatedFundingRates, fundingCostsIncluded);
}

export function getIntervalMs(interval) {
  return INTERVAL_MS[interval] ?? null;
}

const EVIDENCE_THRESHOLDS = Object.freeze({
  minimumHoldoutTrades: 30,
  minimumTradesPerSlice: 10,
  minimumProfitFactor: 1.2,
  maximumHoldoutDrawdownPct: 15,
  minimumPositiveSlices: 2
});

/**
 * Conservative research gate for out-of-sample backtests. Passing only permits
 * paper forward-testing; it never authorizes exchange orders or proves future profit.
 */
export function assessBacktestEvidence(testResults, holdoutSlices, { fundingHistoryVerified = false } = {}) {
  const slices = Array.isArray(holdoutSlices) ? holdoutSlices : [];
  const validSlices = slices.filter(s => s && s.results && Number.isFinite(s.results.closedTrades));
  const positiveSlices = validSlices.filter(s =>
    s.results.closedTrades >= EVIDENCE_THRESHOLDS.minimumTradesPerSlice &&
    Number.isFinite(s.results.netReturnPct) && s.results.netReturnPct > 0
  ).length;
  const underSampledSlices = slices.filter(s =>
    !s || !s.results || !Number.isFinite(s.results.closedTrades) ||
    s.results.closedTrades < EVIDENCE_THRESHOLDS.minimumTradesPerSlice
  ).length;
  const sampleAdequate = Number.isFinite(testResults?.closedTrades) &&
    testResults.closedTrades >= EVIDENCE_THRESHOLDS.minimumHoldoutTrades &&
    slices.length === 3 && underSampledSlices === 0;

  const metricsPass = sampleAdequate && fundingHistoryVerified === true &&
    Number.isFinite(testResults.netReturnPct) && testResults.netReturnPct > 0 &&
    Number.isFinite(testResults.profitFactor) &&
    testResults.profitFactor >= EVIDENCE_THRESHOLDS.minimumProfitFactor &&
    Number.isFinite(testResults.maxDrawdownPct) &&
    testResults.maxDrawdownPct <= EVIDENCE_THRESHOLDS.maximumHoldoutDrawdownPct &&
    positiveSlices >= EVIDENCE_THRESHOLDS.minimumPositiveSlices;

  let status = "INSUFFICIENT_EVIDENCE";
  if (sampleAdequate && !metricsPass) status = "DO_NOT_ADVANCE";
  if (metricsPass) status = "PAPER_FORWARD_TEST_ONLY";

  const reasons = [];
  if (!Number.isFinite(testResults?.closedTrades) || testResults.closedTrades < EVIDENCE_THRESHOLDS.minimumHoldoutTrades) {
    reasons.push("Holdout needs at least 30 closed trades; fewer trades are too weak to judge.");
  }
  if (underSampledSlices > 0 || slices.length !== 3) {
    reasons.push("Each of the three chronological holdout slices needs at least 10 closed trades.");
  }
  if (fundingHistoryVerified !== true) {
    reasons.push("Verified historical funding-rate history is required; missing funding data can overstate perpetual-futures returns.");
  }
  if (sampleAdequate && !(Number.isFinite(testResults.netReturnPct) && testResults.netReturnPct > 0)) {
    reasons.push("Net holdout return after configured fees, slippage, and verified funding is not positive.");
  }
  if (sampleAdequate && !(Number.isFinite(testResults.profitFactor) && testResults.profitFactor >= EVIDENCE_THRESHOLDS.minimumProfitFactor)) {
    reasons.push("Holdout profit factor is below 1.2 or cannot be calculated.");
  }
  if (sampleAdequate && !(Number.isFinite(testResults.maxDrawdownPct) && testResults.maxDrawdownPct <= EVIDENCE_THRESHOLDS.maximumHoldoutDrawdownPct)) {
    reasons.push("Estimated holdout drawdown exceeds 15% or cannot be calculated.");
  }
  if (sampleAdequate && positiveSlices < EVIDENCE_THRESHOLDS.minimumPositiveSlices) {
    reasons.push("Fewer than two of three chronological holdout slices are positive after configured costs.");
  }
  if (metricsPass) reasons.push("Thresholds met for paper forward-testing only; this is not proof of profitability and does not authorize live orders.");

  return {
    status,
    mayStartPaperForwardTest: metricsPass,
    mayPlaceLiveOrders: false,
    fundingHistoryVerified: fundingHistoryVerified === true,
    thresholds: EVIDENCE_THRESHOLDS,
    observed: {
      holdoutClosedTrades: Number.isFinite(testResults?.closedTrades) ? testResults.closedTrades : null,
      holdoutNetReturnPct: Number.isFinite(testResults?.netReturnPct) ? testResults.netReturnPct : null,
      holdoutProfitFactor: Number.isFinite(testResults?.profitFactor) ? testResults.profitFactor : null,
      holdoutMaxDrawdownPct: Number.isFinite(testResults?.maxDrawdownPct) ? testResults.maxDrawdownPct : null,
      positiveHoldoutSlices: positiveSlices,
      holdoutSlices: slices.length
    },
    reasons
  };
}
