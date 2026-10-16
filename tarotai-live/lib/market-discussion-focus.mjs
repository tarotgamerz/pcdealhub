const DEFAULT_SAMPLE = "insufficient trend history";

function finiteCandles(input) {
  return (Array.isArray(input) ? input : []).filter((c) =>
    c && [c.time, c.open, c.high, c.low, c.close, c.volume].every((n) => Number.isFinite(Number(n))) &&
    Number(c.time) > 0 && Number(c.open) > 0 && Number(c.close) > 0 &&
    Number(c.low) > 0 && Number(c.high) >= Math.max(Number(c.open), Number(c.close), Number(c.low)) &&
    Number(c.low) <= Math.min(Number(c.open), Number(c.close), Number(c.high))
  ).slice(-250);
}

function emaLast(values, period) {
  if (values.length < period) return NaN;
  const alpha = 2 / (period + 1);
  let value = values[0];
  for (let i = 1; i < values.length; i += 1) value = values[i] * alpha + value * (1 - alpha);
  return value;
}

function rsiLast(values, period = 14) {
  if (values.length <= period) return NaN;
  let gain = 0, loss = 0;
  for (let i = values.length - period; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    gain += Math.max(0, change);
    loss += Math.max(0, -change);
  }
  if (loss === 0) return gain > 0 ? 100 : 50;
  return 100 - 100 / (1 + gain / loss);
}

function atrLast(candles, period = 14) {
  if (candles.length <= period) return NaN;
  const start = candles.length - period;
  let total = 0;
  for (let i = start; i < candles.length; i += 1) {
    const c = candles[i], prev = candles[i - 1];
    total += Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
  }
  return total / period;
}

function price(value) {
  if (!Number.isFinite(value)) return "unavailable";
  const digits = value >= 1000 ? 2 : value >= 1 ? 4 : value >= 0.01 ? 6 : 8;
  return Number(value.toFixed(digits)).toLocaleString("en-US", { maximumFractionDigits: digits, useGrouping: false });
}

function safeLabel(value, fallback, max = 40) {
  const cleaned = String(value ?? "").replace(/[^a-zA-Z0-9 _./:+%-]/g, "").trim().slice(0, max);
  return cleaned || fallback;
}

/**
 * Derive a concise, reproducible peer-discussion focus from verified closed candles.
 * This intentionally never infers liquidity/order-book/funding/news when those feeds
 * are not present in the supplied snapshot.
 */
export function buildAutomaticMarketDiscussionFocus(input = {}) {
  const symbol = safeLabel(input.symbol, "MARKET", 20).toUpperCase();
  const interval = safeLabel(input.interval, "15m", 8);
  const candles = finiteCandles(input.candles);
  const higherTrend = safeLabel(input.higherTrend, "unavailable", 32);
  const study = input.historicalStudy && typeof input.historicalStudy === "object" ? input.historicalStudy : {};
  const n = Number(study.sampleCount);
  const historicalN = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  const historicalBias = safeLabel(study.sideBias, "NEUTRAL", 20).toUpperCase();

  if (candles.length < 25) {
    const topic = symbol + " " + interval + ": insufficient verified candles; WAIT versus further confirmation";
    return {
      topic,
      directive: "Automatic focus: the verified snapshot has fewer than 25 usable closed candles. Explain the missing evidence, request no extra data or topic from the owner, and recommend WAIT. Do not invent levels or claim order-book/liquidity visibility.",
      facts: { candleCount: candles.length, higherTrend, historicalSampleCount: historicalN, status: "INSUFFICIENT_DATA" }
    };
  }

  const closes = candles.map((c) => Number(c.close));
  const last = candles[candles.length - 1];
  const prior = candles.slice(-21, -1);
  const priorHigh = Math.max(...prior.map((c) => Number(c.high)));
  const priorLow = Math.min(...prior.map((c) => Number(c.low)));
  const ema20 = emaLast(closes.slice(-Math.min(closes.length, 150)), 20);
  const ema50 = emaLast(closes.slice(-Math.min(closes.length, 180)), 50);
  const rsi14 = rsiLast(closes, 14);
  const atr14 = atrLast(candles, 14);
  const atrPct = Number.isFinite(atr14) && last.close > 0 ? atr14 / last.close * 100 : NaN;

  let structure = "rotating within the prior 20-candle range";
  let structureState = "RANGE";
  if (last.close > priorHigh) {
    structure = "closed above the prior 20-candle high (breakout confirmation versus failed breakout)";
    structureState = "UPSIDE_BREAKOUT";
  } else if (last.close < priorLow) {
    structure = "closed below the prior 20-candle low (breakdown confirmation versus failed breakdown)";
    structureState = "DOWNSIDE_BREAKDOWN";
  } else if (last.high >= priorHigh && last.close < priorHigh) {
    structure = "tested or swept the prior 20-candle high but closed back inside (upper-edge rejection versus breakout)";
    structureState = "UPPER_REJECTION";
  } else if (last.low <= priorLow && last.close > priorLow) {
    structure = "tested or swept the prior 20-candle low but closed back inside (lower-edge rejection versus breakdown)";
    structureState = "LOWER_REJECTION";
  } else if (Number.isFinite(atr14) && priorHigh - last.close <= atr14 * 0.6) {
    structure = "approaching the prior 20-candle resistance area";
    structureState = "NEAR_RESISTANCE";
  } else if (Number.isFinite(atr14) && last.close - priorLow <= atr14 * 0.6) {
    structure = "approaching the prior 20-candle support area";
    structureState = "NEAR_SUPPORT";
  }

  let trend = "mixed / neutral";
  if (Number.isFinite(ema20) && Number.isFinite(ema50)) {
    if (last.close > ema20 && ema20 > ema50) trend = "bullish EMA20/EMA50 alignment";
    else if (last.close < ema20 && ema20 < ema50) trend = "bearish EMA20/EMA50 alignment";
    else trend = "mixed EMA20/EMA50 alignment";
  } else {
    trend = DEFAULT_SAMPLE;
  }

  const momentum = !Number.isFinite(rsi14) ? "RSI14 unavailable" :
    rsi14 >= 70 ? "RSI14 " + rsi14.toFixed(1) + " is overbought" :
    rsi14 <= 30 ? "RSI14 " + rsi14.toFixed(1) + " is oversold" :
    "RSI14 " + rsi14.toFixed(1);
  const aligned = /bullish/i.test(trend) && /bullish/i.test(higherTrend) ||
    /bearish/i.test(trend) && /bearish/i.test(higherTrend);
  const htfContext = higherTrend === "unavailable" ? "higher timeframe unavailable" :
    aligned ? "timeframes aligned" : "timeframe alignment is mixed or conflicting";
  const historical = historicalN > 0
    ? historicalBias + " bias across " + historicalN + " historical analogue(s)"
    : "no usable historical analogue sample";

  const topic = symbol + " " + interval + ": " + structure + "; next-move scenario and invalidation";
  const directive = (
    "Auto-derived from verified closed OHLCV: " + structure + ". Close " + price(last.close) +
    "; prior-20 high/low " + price(priorHigh) + "/" + price(priorLow) +
    "; EMA20/50 " + price(ema20) + "/" + price(ema50) +
    "; " + momentum + "; ATR14 " + price(atr14) + " (" + (Number.isFinite(atrPct) ? atrPct.toFixed(3) : "n/a") +
    "% of close). Trend " + trend + "; HTF " + higherTrend + "; history " + historical +
    ". Debate continuation vs rejection/range reversion over 3–6 bars; cite evidence, trigger, invalidation and the strongest counterargument. Choose LONG/SHORT/WAIT. No unprovided order-book, liquidity, funding or news claims."
  ).slice(0, 500);

  return {
    topic,
    directive,
    facts: {
      status: "READY",
      candleCount: candles.length,
      lastClosedCandleTime: Number(last.time),
      lastClose: Number(last.close),
      prior20High: priorHigh,
      prior20Low: priorLow,
      ema20,
      ema50,
      rsi14,
      atr14,
      atrPercent: Number.isFinite(atrPct) ? Number(atrPct.toFixed(4)) : null,
      localTrend: trend,
      structure: structureState,
      higherTrend,
      historicalBias,
      historicalSampleCount: historicalN,
      timeframeAlignment: aligned ? "ALIGNED" : "MIXED_OR_UNAVAILABLE"
    }
  };
}
