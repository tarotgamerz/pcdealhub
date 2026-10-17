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
    if (i > 0 && c.time <= candles[i - 1].time) throw new Error("Candles must be strictly chronological");
  }
  return true;
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

function summarizeTrades(trades, equity, maxDrawdown, closedTradeMaxDrawdown, candles, startIndex, endIndex, feeRate, slipRate) {
  const wins = trades.filter(t => t.netReturnPct > 0);
  const losses = trades.filter(t => t.netReturnPct < 0);
  const grossWins = wins.reduce((sum, t) => sum + t.netReturnPct, 0);
  const grossLosses = -losses.reduce((sum, t) => sum + t.netReturnPct, 0);
  const first = candles[Math.min(startIndex, candles.length - 1)];
  const last = candles[Math.max(Math.min(endIndex, candles.length) - 1, 0)];
  let buyHoldReturnPct = null;
  if (first && last && last.time >= first.time) {
    const entryFill = first.open * (1 + slipRate);
    const exitFill = last.close * (1 - slipRate);
    buyHoldReturnPct = (entryFill > 0 ? (exitFill / entryFill - 1) - feeRate * (1 + exitFill / entryFill) : 0) * 100;
  }
  return {
    equityCurve: trades.slice(-200).map(t => ({ time: t.exitTime, equity: Number(t.equityAfter.toFixed(6)) })),
    netReturnPct: Number(((equity - 1) * 100).toFixed(3)),
    buyHoldReturnPct: Number((buyHoldReturnPct ?? 0).toFixed(3)),
    closedTrades: trades.length,
    winRatePct: trades.length ? Number((wins.length / trades.length * 100).toFixed(2)) : 0,
    profitFactor: grossLosses > 0 ? Number((grossWins / grossLosses).toFixed(3)) : (grossWins > 0 ? null : 0),
    averageTradePct: trades.length ? Number((trades.reduce((s, t) => s + t.netReturnPct, 0) / trades.length).toFixed(4)) : 0,
    averageWinnerPct: wins.length ? Number((grossWins / wins.length).toFixed(4)) : 0,
    averageLoserPct: losses.length ? Number((-grossLosses / losses.length).toFixed(4)) : 0,
    maxDrawdownPct: Number((maxDrawdown * 100).toFixed(3)),
    closedTradeMaxDrawdownPct: Number((closedTradeMaxDrawdown * 100).toFixed(3)),
    drawdownMethod: "Mark-to-market estimate using each candle's adverse high/low, adverse exit slippage, and entry/exit fees; OHLC cannot reveal intrabar order.",
    firstCandleTime: first?.time ?? null,
    lastCandleTime: last?.time ?? null,
    recentTrades: trades.slice(-20).map(t => ({
      side: t.side, entryTime: t.entryTime, exitTime: t.exitTime,
      entryPrice: Number(t.entryPrice.toFixed(6)), exitPrice: Number(t.exitPrice.toFixed(6)),
      netReturnPct: Number(t.netReturnPct.toFixed(4)), exitReason: t.exitReason
    }))
  };
}

export function runSmaCrossoverBacktest(candles, {
  fastPeriod = 9, slowPeriod = 21, feeBps = 5, slippageBps = 2, startIndex = null, endIndex = null
} = {}) {
  validateBacktestCandles(candles);
  if (!Number.isInteger(fastPeriod) || !Number.isInteger(slowPeriod) || fastPeriod < 2 || slowPeriod <= fastPeriod || slowPeriod > 100) {
    throw new Error("Require integer periods with 2 <= fastPeriod < slowPeriod <= 100");
  }
  if (![feeBps, slippageBps].every(Number.isFinite) || feeBps < 0 || feeBps > 50 || slippageBps < 0 || slippageBps > 50) {
    throw new Error("Fees and slippage must be between 0 and 50 basis points per side");
  }
  const start = startIndex == null ? slowPeriod : Math.max(slowPeriod, Math.floor(startIndex));
  const end = endIndex == null ? candles.length : Math.min(candles.length, Math.floor(endIndex));
  if (start < 0 || end - start < 3) throw new Error("Not enough candles in this backtest window");

  const closes = candles.map(c => c.close);
  const fast = calculateSma(closes, fastPeriod);
  const slow = calculateSma(closes, slowPeriod);
  const feeRate = feeBps / 10_000;
  const slipRate = slippageBps / 10_000;
  let side = 0, entryFill = 0, entryTime = 0, equity = 1, peak = 1, maxDrawdown = 0;
  let closedTradePeak = 1, closedTradeMaxDrawdown = 0;
  const trades = [];

  const closePosition = (marketPrice, time, reason) => {
    if (!side) return;
    const exitFill = marketPrice * (1 - side * slipRate);
    const grossReturn = side * (exitFill / entryFill - 1);
    const netReturn = grossReturn - feeRate * (1 + exitFill / entryFill);
    trades.push({ side: side === 1 ? "LONG" : "SHORT", entryTime, exitTime: time, entryPrice: entryFill, exitPrice: exitFill, netReturnPct: netReturn * 100, exitReason: reason });
    equity *= Math.max(0, 1 + netReturn);
    trades[trades.length - 1].equityAfter = equity;
    closedTradePeak = Math.max(closedTradePeak, equity);
    if (closedTradePeak > 0) closedTradeMaxDrawdown = Math.max(closedTradeMaxDrawdown, (closedTradePeak - equity) / closedTradePeak);
    peak = Math.max(peak, equity);
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - equity) / peak);
    side = 0; entryFill = 0; entryTime = 0;
  };

  // Estimate open-equity drawdown conservatively from each candle's adverse
  // extreme. This is not tick-level replay and cannot determine the intrabar path.
  const markIntratradeDrawdown = (candle) => {
    if (!side || !candle) return;
    const markedEquity = (marketPrice) => {
      const hypotheticalExitFill = marketPrice * (1 - side * slipRate);
      const grossReturn = side * (hypotheticalExitFill / entryFill - 1);
      const netReturn = grossReturn - feeRate * (1 + hypotheticalExitFill / entryFill);
      return equity * Math.max(0, 1 + netReturn);
    };
    const favorablePrice = side === 1 ? candle.high : candle.low;
    const adversePrice = side === 1 ? candle.low : candle.high;
    const favorableEquity = markedEquity(favorablePrice);
    const adverseEquity = markedEquity(adversePrice);
    peak = Math.max(peak, favorableEquity);
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - adverseEquity) / peak);
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
  }
  const last = candles[end - 1];
  markIntratradeDrawdown(last);
  closePosition(last.close, last.time, "WINDOW_END");
  return summarizeTrades(trades, equity, maxDrawdown, closedTradeMaxDrawdown, candles, start, end, feeRate, slipRate);
}

export function getIntervalMs(interval) {
  return INTERVAL_MS[interval] ?? null;
}
