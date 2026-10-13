(function (root) {
  "use strict";
  const INTERVAL_MS = { "1m": 60000, "3m": 180000, "5m": 300000, "15m": 900000, "30m": 1800000, "1h": 3600000, "2h": 7200000, "4h": 14400000, "1d": 86400000 };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mean = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
  const median = (values) => {
    if (!values.length) return NaN;
    const v = values.slice().sort((a, b) => a - b), m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  };
  function ema(values, period) {
    const k = 2 / (period + 1), out = Array(values.length).fill(NaN);
    if (!values.length) return out;
    out[0] = values[0];
    for (let i = 1; i < values.length; i++) out[i] = values[i] * k + out[i - 1] * (1 - k);
    return out;
  }
  function rsi(values, period) {
    const out = Array(values.length).fill(NaN);
    if (values.length <= period) return out;
    let gain = 0, loss = 0;
    for (let i = 1; i <= period; i++) { const d = values[i] - values[i - 1]; gain += Math.max(0, d); loss += Math.max(0, -d); }
    gain /= period; loss /= period; out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    for (let i = period + 1; i < values.length; i++) {
      const d = values[i] - values[i - 1];
      gain = (gain * (period - 1) + Math.max(0, d)) / period;
      loss = (loss * (period - 1) + Math.max(0, -d)) / period;
      out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    }
    return out;
  }
  function atr(candles, period) {
    const tr = candles.map((c, i) => i === 0 ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close)));
    const out = Array(tr.length).fill(NaN);
    if (tr.length < period) return out;
    let current = mean(tr.slice(0, period)); out[period - 1] = current;
    for (let i = period; i < tr.length; i++) { current = (current * (period - 1) + tr[i]) / period; out[i] = current; }
    return out;
  }
  function classifyPattern(c, prev, f) {
    if (f.close > f.priorHigh) return "20-bar upside breakout";
    if (f.close < f.priorLow) return "20-bar downside breakdown";
    if (f.atrRatio < 0.65) return "volatility compression";
    if (f.atrRatio > 1.55 && Math.abs(f.bodyAtr) < 0.45) return "volatility expansion / indecision";
    if (f.volumeRatio > 1.6 && ((f.trend > 0.5 && c.close < c.open) || (f.trend < 0.5 && c.close > c.open))) return "high-volume countertrend candle";
    if (f.trend > 0.62 && f.close < f.ema9 && c.close >= c.open) return "bull trend pullback";
    if (f.trend < 0.38 && f.close > f.ema9 && c.close <= c.open) return "bear trend pullback";
    if (f.rsi >= 0.65) return "high-RSI momentum";
    if (f.rsi <= 0.35) return "low-RSI momentum";
    if (f.trend > 0.62) return "rising-trend continuation";
    if (f.trend < 0.38) return "falling-trend continuation";
    return "range / mixed regime";
  }
  function featureAt(candles, i, arrays) {
    const c = candles[i], atrNow = arrays.atr[i], rsiNow = arrays.rsi[i];
    if (!Number.isFinite(atrNow) || atrNow <= 0 || !Number.isFinite(rsiNow) || i < 55) return null;
    const closes = candles.map(x => x.close), highStart = Math.max(0, i - 20), prior = candles.slice(highStart, i);
    if (prior.length < 20) return null;
    const priorHigh = Math.max(...prior.map(x => x.high)), priorLow = Math.min(...prior.map(x => x.low)), priorRange = Math.max(priorHigh - priorLow, 1e-12);
    const atrAvg = mean(arrays.atr.slice(Math.max(20, i - 20), i).filter(Number.isFinite));
    const volAvg = mean(candles.slice(Math.max(0, i - 20), i).map(x => x.volume).filter(v => Number.isFinite(v) && v > 0));
    const atrRatio = atrAvg > 0 ? atrNow / atrAvg : 1;
    const volumeRatio = volAvg > 0 && Number.isFinite(c.volume) ? c.volume / volAvg : 1;
    const trend = clamp((arrays.ema9[i] - arrays.ema21[i]) / atrNow, -2, 2) / 4 + 0.5;
    const ema50Gap = clamp((c.close - arrays.ema50[i]) / atrNow, -4, 4) / 8 + 0.5;
    const rangePosition = clamp((c.close - priorLow) / priorRange, -0.5, 1.5);
    const rsiNorm = rsiNow / 100;
    const volatility = clamp(atrRatio, 0, 3) / 3;
    const bodyAtr = clamp((c.close - c.open) / atrNow, -2, 2) / 4 + 0.5;
    const volNorm = clamp(volumeRatio, 0, 3) / 3;
    const vector = [trend, ema50Gap, rsiNorm, (rangePosition + 0.5) / 2, volatility, bodyAtr, volNorm];
    if (vector.some(v => !Number.isFinite(v))) return null;
    const priorEma9 = arrays.ema9[Math.max(0, i - 3)];
    return { vector, close: c.close, priorHigh, priorLow, atr: atrNow, atrRatio, volumeRatio,
      rsi: rsiNow, trend, ema9: arrays.ema9[i], bodyAtr: (c.close - c.open) / atrNow,
      pattern: classifyPattern({ ...c, close: c.close }, candles[i - 1], { close: c.close, priorHigh, priorLow, atrRatio, bodyAtr: (c.close - c.open) / atrNow, volumeRatio, rsi: rsiNorm, trend, ema9: arrays.ema9[i], priorEma9 }),
      candleTime: c.time };
  }
  function findSimilarCases(input, interval, options) {
    options = options || {};
    const horizon = clamp(Math.floor(Number(options.horizon) || 6), 3, 12);
    const maxExamples = clamp(Math.floor(Number(options.maxExamples) || 8), 3, 12);
    const maxDistance = Number.isFinite(options.maxDistance) ? clamp(options.maxDistance, 0.05, 1) : 0.34;
    const candles = Array.isArray(input) ? input.filter(c => c && [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite) && c.low > 0 && c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close, c.high)).slice().sort((a, b) => a.time - b.time) : [];
    const intervalMs = INTERVAL_MS[interval];
    if (!intervalMs) return { ready: false, reason: "Unsupported chart timeframe.", examples: [], sampleCount: 0 };
    if (candles.length < 130) return { ready: false, reason: "Need at least 130 valid candles to compare historical patterns without using unfinished examples.", examples: [], sampleCount: 0 };
    if (candles.some((c, i) => i > 0 && c.time <= candles[i - 1].time)) return { ready: false, reason: "Candles must have unique chronological timestamps.", examples: [], sampleCount: 0 };

    const closes = candles.map(c => c.close), arrays = { ema9: ema(closes, 9), ema21: ema(closes, 21), ema50: ema(closes, 50), rsi: rsi(closes, 14), atr: atr(candles, 14) };
    const nowIdx = candles.length - 1, current = featureAt(candles, nowIdx, arrays);
    if (!current) return { ready: false, reason: "Current pattern features are incomplete.", examples: [], sampleCount: 0 };
    const weights = [1.15, 1.05, 0.9, 0.85, 0.75, 0.65, 0.65], weightSum = weights.reduce((a,b)=>a+b,0);
    const start = 60, lastEligible = candles.length - horizon - 1 - Math.max(4, Math.floor(horizon / 2)), pool = [];
    for (let i = start; i <= lastEligible; i++) {
      const sample = featureAt(candles, i, arrays);
      if (!sample) continue;
      let weightedSq = 0;
      for (let j = 0; j < weights.length; j++) weightedSq += weights[j] * Math.pow(sample.vector[j] - current.vector[j], 2);
      const distance = Math.sqrt(weightedSq / weightSum);
      if (distance > maxDistance) continue;
      const future = candles[i + horizon], ret = (future.close / candles[i].close - 1) * 100;
      const noisePct = Math.max(0.08, sample.atr / candles[i].close * 100 * 0.3);
      const outcome = ret > noisePct ? "UP" : ret < -noisePct ? "DOWN" : "FLAT";
      pool.push({ time: candles[i].time, close: candles[i].close, pattern: sample.pattern, distance,
        similarityPct: clamp((1 - distance) * 100, 0, 100), forwardReturnPct: ret, outcome, horizon,
        candleEndTime: candles[i].time + intervalMs - 1 });
    }
    pool.sort((a, b) => a.distance - b.distance);
    const examples = pool.slice(0, maxExamples);
    const returns = examples.map(e => e.forwardReturnPct), ups = examples.filter(e => e.outcome === "UP").length, downs = examples.filter(e => e.outcome === "DOWN").length;
    const positiveSharePct = examples.length ? ups / examples.length * 100 : null, negativeSharePct = examples.length ? downs / examples.length * 100 : null, averageReturnPct = returns.length ? mean(returns) : null;
    let sideBias = "NEUTRAL";
    if (examples.length >= 5 && positiveSharePct >= 60 && averageReturnPct > 0) sideBias = "LONG";
    if (examples.length >= 5 && negativeSharePct >= 60 && averageReturnPct < 0) sideBias = "SHORT";
    return { ready: examples.length >= 3, reason: examples.length >= 3 ? "Historical analogues found in earlier closed candles from the currently selected symbol, exchange and timeframe." : "Too few genuinely similar historical cases; no historical edge claim is made.",
      symbolTimeframe: interval, horizon, horizonLabel: horizon + " candles", maxDistance, sampleCount: examples.length, positiveSharePct, negativeSharePct,
      averageReturnPct, medianReturnPct: returns.length ? median(returns) : null, sideBias, examples,
      current: { time: current.candleTime, close: current.close, pattern: current.pattern, rsi: current.rsi, atrRatio: current.atrRatio } };
  }
  root.TarotAIMarketPatterns = { findSimilarCases };
})(typeof window !== "undefined" ? window : globalThis);
