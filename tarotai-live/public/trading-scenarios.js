(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TarotAIScenarioForecast = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function ema(values, period) {
    if (!values.length) return [];
    const k = 2 / (period + 1), out = [values[0]];
    for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
    return out;
  }

  function rsi(values, period) {
    const out = Array(values.length).fill(NaN);
    if (values.length <= period) return out;
    let gain = 0, loss = 0;
    for (let i = 1; i <= period; i++) {
      const change = values[i] - values[i - 1];
      gain += Math.max(change, 0);
      loss += Math.max(-change, 0);
    }
    gain /= period; loss /= period;
    out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    for (let i = period + 1; i < values.length; i++) {
      const change = values[i] - values[i - 1];
      gain = (gain * (period - 1) + Math.max(change, 0)) / period;
      loss = (loss * (period - 1) + Math.max(-change, 0)) / period;
      out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    }
    return out;
  }

  function atr(candles, period) {
    const tr = candles.map((c, i) => i === 0 ? c.high - c.low :
      Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close)));
    const out = Array(tr.length).fill(NaN);
    if (tr.length < period) return out;
    let value = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
    out[period - 1] = value;
    for (let i = period; i < tr.length; i++) {
      value = (value * (period - 1) + tr[i]) / period;
      out[i] = value;
    }
    return out;
  }

  function validCandles(input) {
    if (!Array.isArray(input) || input.length === 0) return false;
    let previousTime = 0;
    for (const c of input) {
      // Market feed parsers must normalize exchange values before this calculation.
      // Reject strings, duplicate timestamps and out-of-order candles rather than
      // letting coercion or future data silently corrupt chart geometry/backtests.
      if (!c || ![c.time, c.open, c.high, c.low, c.close].every((n) => typeof n === "number" && Number.isFinite(n))) return false;
      if (c.time <= previousTime || c.time <= 0 || c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0) return false;
      if (c.high < Math.max(c.open, c.close, c.low) || c.low > Math.min(c.open, c.close, c.high)) return false;
      previousTime = c.time;
    }
    return true;
  }

  function scoreAt(candles, index, indicators) {
    const last = candles[index], prev = candles[index - 1];
    const prior = candles.slice(index - 20, index);
    if (!last || !prev || prior.length < 20) return null;
    const priorHigh = Math.max(...prior.map((c) => c.high));
    const priorLow = Math.min(...prior.map((c) => c.low));
    const upBreak = last.close > priorHigh, downBreak = last.close < priorLow;
    const { e9, e21, e50, rv, av } = indicators;
    const longChecks = [
      e9[index] > e21[index],
      last.close > e50[index],
      rv[index] >= 52 && rv[index] <= 70,
      e9[index] > e9[Math.max(0, index - 3)] && last.close > prev.close,
      upBreak
    ];
    const shortChecks = [
      e9[index] < e21[index],
      last.close < e50[index],
      rv[index] >= 30 && rv[index] <= 48,
      e9[index] < e9[Math.max(0, index - 3)] && last.close < prev.close,
      downBreak
    ];
    const longScore = longChecks.filter(Boolean).length;
    const shortScore = shortChecks.filter(Boolean).length;
    let signal = "NONE";
    if (upBreak && longScore >= 4 && longScore > shortScore) signal = "LONG";
    else if (downBreak && shortScore >= 4 && shortScore > longScore) signal = "SHORT";
    return { last, priorHigh, priorLow, upBreak, downBreak, longScore, shortScore, signal, atr: av[index] };
  }

  function buildScenarioForecast(input, options) {
    const opts = options || {};
    const intervalMs = Number(opts.intervalMs);
    if (!validCandles(input) || input.length < 80 || !Number.isFinite(intervalMs) || intervalMs <= 0) {
      return { ready: false, reason: "At least 80 valid closed candles and a valid timeframe are required." };
    }
    // Bound CPU work regardless of how many historical candles the chart has loaded.
    const candles = input.slice(-400);
    const closes = candles.map((c) => Number(c.close));
    const indicators = { e9: ema(closes, 9), e21: ema(closes, 21), e50: ema(closes, 50),
      rv: rsi(closes, 14), av: atr(candles, 14) };
    const index = candles.length - 1;
    const scored = scoreAt(candles, index, indicators);
    if (!scored || !Number.isFinite(scored.atr) || scored.atr <= 0 ||
        !Number.isFinite(indicators.rv[index])) {
      return { ready: false, reason: "Indicator history is incomplete; forecast withheld." };
    }

    const { last, priorHigh, priorLow, longScore, shortScore, signal } = scored;
    const volatilityPct = scored.atr / last.close * 100;
    const bullBias = longScore >= 4 && longScore >= shortScore + 2;
    const bearBias = shortScore >= 4 && shortScore >= longScore + 2;
    const bias = signal === "LONG" ? "BULLISH BREAKOUT CONFIRMED" :
      signal === "SHORT" ? "BEARISH BREAKDOWN CONFIRMED" :
      bullBias ? "BULLISH LEAN · TRIGGER UNCONFIRMED" :
      bearBias ? "BEARISH LEAN · TRIGGER UNCONFIRMED" : "RANGE / WAIT";
    const horizon = 4;
    const makeScenario = (side) => {
      const sign = side === "BULL" ? 1 : -1;
      const trigger = side === "BULL" ? priorHigh : priorLow;
      const target = last.close + sign * scored.atr * 1.5;
      const invalidation = last.close - sign * scored.atr;
      const progress = [0.22, 0.50, 0.82, 1.0];
      return {
        side, label: side === "BULL" ? "Conditional bullish continuation" : "Conditional bearish continuation",
        trigger, triggerCondition: side === "BULL" ? "a candle CLOSES above resistance" : "a candle CLOSES below support",
        activated: side === "BULL" ? scored.upBreak : scored.downBreak,
        invalidation, target, movePct: (target / last.close - 1) * 100,
        projected: progress.map((fraction, step) => ({
          time: Number(last.time) + intervalMs * (step + 1),
          value: last.close + (target - last.close) * fraction
        }))
      };
    };
    return {
      ready: true, symbol: opts.symbol || "", interval: opts.interval || "",
      candleTime: Number(last.time), basedOn: "closed OHLC candles only",
      bias, longScore, shortScore, signal, close: last.close,
      atr: scored.atr, volatilityPct, horizonBars: horizon,
      support: priorLow, resistance: priorHigh,
      higherTimeframe: String(opts.higherTimeframeDirection || "UNAVAILABLE"),
      scenarios: { bull: makeScenario("BULL"), bear: makeScenario("BEAR") },
      note: "Conditional paths are scenario drawings, not calibrated probabilities or guaranteed price targets."
    };
  }

  function backtestScenarioForecast(input, options) {
    const opts = options || {}, horizon = Math.max(1, Math.min(8, Math.floor(Number(opts.horizon) || 3)));
    if (!validCandles(input) || input.length < 100) {
      return { ready: false, reason: "At least 100 valid candles are needed for walk-forward replay." };
    }
    // Keep this replay bounded and strictly chronological. Signals only use data available at their own close.
    const candles = input.slice(-400), closes = candles.map((c) => Number(c.close));
    const indicators = { e9: ema(closes, 9), e21: ema(closes, 21), e50: ema(closes, 50),
      rv: rsi(closes, 14), av: atr(candles, 14) };
    let signals = 0, targetFirst = 0, stopFirst = 0, timeouts = 0;
    const start = Math.max(80, candles.length - 400);
    for (let i = start; i < candles.length - horizon - 1 && signals < 120; i++) {
      const setup = scoreAt(candles, i, indicators);
      if (!setup || setup.signal === "NONE" || !Number.isFinite(setup.atr) || setup.atr <= 0) continue;
      signals++;
      const sign = setup.signal === "LONG" ? 1 : -1;
      const target = setup.last.close + sign * setup.atr * 1.5;
      const stop = setup.last.close - sign * setup.atr;
      let outcome = "TIMEOUT";
      for (let j = i + 1; j <= Math.min(candles.length - 1, i + horizon); j++) {
        const c = candles[j];
        const hitStop = sign > 0 ? c.low <= stop : c.high >= stop;
        const hitTarget = sign > 0 ? c.high >= target : c.low <= target;
        // Conservative tie-break: if both levels occur in one OHLC bar, count the stop first.
        if (hitStop) { outcome = "STOP"; break; }
        if (hitTarget) { outcome = "TARGET"; break; }
      }
      if (outcome === "TARGET") targetFirst++;
      else if (outcome === "STOP") stopFirst++;
      else timeouts++;
      i += horizon; // Prevent overlapping hypothetical positions from inflating the sample.
    }
    const resolved = targetFirst + stopFirst;
    return {
      ready: true, candlesUsed: candles.length, horizonBars: horizon, signals,
      targetFirst, stopFirst, timeouts, resolved,
      targetBeforeStopPct: resolved ? targetFirst / resolved * 100 : null,
      targetOfAllSignalsPct: signals ? targetFirst / signals * 100 : null,
      caveat: "Historical walk-forward replay only; resolved cases exclude timeouts. No fees, slippage, funding, latency or execution errors are modeled."
    };
  }

  return { buildScenarioForecast, backtestScenarioForecast };
});
