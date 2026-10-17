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

  function validCandles(input, intervalMs) {
    if (!Array.isArray(input) || input.length === 0) return false;
    const duration = Number(intervalMs);
    let previousTime = 0;
    for (const c of input) {
      // Forecast data must already be normalized by the exchange adapter.
      // Missing volume cannot be treated as confirmation and broken time order is unsafe.
      if (!c || ![c.time, c.open, c.high, c.low, c.close, c.volume].every((n) => typeof n === "number" && Number.isFinite(n))) return false;
      if (c.time <= previousTime || c.time <= 0 || c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0 || c.volume < 0) return false;
      if (c.high < Math.max(c.open, c.close, c.low) || c.low > Math.min(c.open, c.close, c.high)) return false;
      // A large hole means the apparent "next N bars" horizon may not represent elapsed time.
      if (previousTime && Number.isFinite(duration) && duration > 0 && c.time - previousTime > duration * 2.5) return false;
      previousTime = c.time;
    }
    return true;
  }

  function scoreAt(candles, index, indicators, higherTimeframeDirection) {
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
    const candidateSignal = upBreak && longScore >= 4 && longScore > shortScore ? "LONG" :
      downBreak && shortScore >= 4 && shortScore > longScore ? "SHORT" : "NONE";
    const direction = String(higherTimeframeDirection || "UNAVAILABLE").toUpperCase();
    const higherTimeframeAligned = candidateSignal === "LONG" ? direction === "BULLISH" :
      candidateSignal === "SHORT" ? direction === "BEARISH" : false;
    const averageVolume = prior.reduce((sum, candle) => sum + candle.volume, 0) / prior.length;
    const relativeVolume = averageVolume > 0 ? last.volume / averageVolume : NaN;
    // Require a meaningful pickup in traded activity before labelling a breakout confirmed.
    const volumeConfirmed = Number.isFinite(relativeVolume) && relativeVolume >= 1.1;
    const signal = candidateSignal !== "NONE" && higherTimeframeAligned && volumeConfirmed ? candidateSignal : "NONE";
    return {
      last, priorHigh, priorLow, upBreak, downBreak, longScore, shortScore,
      candidateSignal, signal, higherTimeframeDirection: direction, higherTimeframeAligned,
      averageVolume, relativeVolume, volumeConfirmed, atr: av[index]
    };
  }

  function buildScenarioForecast(input, options) {
    const opts = options || {};
    const intervalMs = Number(opts.intervalMs);
    if (!validCandles(input, intervalMs) || input.length < 80 || !Number.isFinite(intervalMs) || intervalMs <= 0) {
      return { ready: false, reason: "At least 80 valid closed candles and a valid timeframe are required." };
    }
    // Bound CPU work regardless of how many historical candles the chart has loaded.
    const candles = input.slice(-800);
    const closes = candles.map((c) => Number(c.close));
    const indicators = { e9: ema(closes, 9), e21: ema(closes, 21), e50: ema(closes, 50),
      rv: rsi(closes, 14), av: atr(candles, 14) };
    const index = candles.length - 1;
    const scored = scoreAt(candles, index, indicators, opts.higherTimeframeDirection);
    if (!scored || !Number.isFinite(scored.atr) || scored.atr <= 0 ||
        !Number.isFinite(indicators.rv[index])) {
      return { ready: false, reason: "Indicator history is incomplete; forecast withheld." };
    }

    const { last, priorHigh, priorLow, longScore, shortScore, signal } = scored;
    const volatilityPct = scored.atr / last.close * 100;
    const bullBias = longScore >= 4 && longScore >= shortScore + 2;
    const bearBias = shortScore >= 4 && shortScore >= longScore + 2;
    const higherTimeframe = scored.higherTimeframeDirection;
    let bias;
    if (signal === "LONG") bias = "BULLISH BREAKOUT CONFIRMED";
    else if (signal === "SHORT") bias = "BEARISH BREAKDOWN CONFIRMED";
    else if (scored.candidateSignal !== "NONE" && !["BULLISH", "BEARISH"].includes(higherTimeframe)) bias = "BREAKOUT · HIGHER-TIMEFRAME UNAVAILABLE · WAIT";
    else if (scored.candidateSignal !== "NONE" && !scored.higherTimeframeAligned) bias = "COUNTER-TREND BREAKOUT · WAIT";
    else if (scored.candidateSignal !== "NONE" && !scored.volumeConfirmed) bias = "BREAKOUT LACKS VOLUME CONFIRMATION · WAIT";
    else if (bullBias && higherTimeframe === "BULLISH") bias = "BULLISH LEAN · TRIGGER UNCONFIRMED";
    else if (bearBias && higherTimeframe === "BEARISH") bias = "BEARISH LEAN · TRIGGER UNCONFIRMED";
    else bias = "RANGE / WAIT";
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
      higherTimeframe,
      candidateSignal: scored.candidateSignal,
      higherTimeframeAligned: scored.higherTimeframeAligned,
      relativeVolume: scored.relativeVolume,
      volumeConfirmed: scored.volumeConfirmed,
      volumeThreshold: 1.1,
      scenarios: { bull: makeScenario("BULL"), bear: makeScenario("BEAR") },
      note: "Conditional paths are scenario drawings, not calibrated probabilities or guaranteed price targets; a directional confirmation requires a matching higher-timeframe trend and at least 1.1x relative volume."
    };
  }

  function backtestScenarioForecast(input, options) {
    const opts = options || {}, horizon = Math.max(1, Math.min(8, Math.floor(Number(opts.horizon) || 3)));
    const intervalMs = Number(opts.intervalMs);
    const higherTimeframeIntervalMs = Number(opts.higherTimeframeIntervalMs);
    const higherTimeframeCandles = opts.higherTimeframeCandles;
    if (!Number.isFinite(intervalMs) || intervalMs <= 0 || !validCandles(input, intervalMs) || input.length < 100) {
      return { ready: false, reason: "At least 100 valid main-timeframe candles and a valid timeframe are needed for walk-forward replay." };
    }
    if (!Number.isFinite(higherTimeframeIntervalMs) || higherTimeframeIntervalMs <= 0 ||
        !Array.isArray(higherTimeframeCandles) || higherTimeframeCandles.length < 55 ||
        !validCandles(higherTimeframeCandles, higherTimeframeIntervalMs)) {
      return { ready: false, reason: "Verified higher-timeframe history is required so replay uses the same trend-confirmation rule as the live forecast." };
    }
    // Use more history for a less noisy sample, but keep CPU and memory strictly bounded.
    const candles = input.slice(-1200), closes = candles.map((c) => Number(c.close));
    const htfCandles = higherTimeframeCandles.slice(-180);
    const indicators = { e9: ema(closes, 9), e21: ema(closes, 21), e50: ema(closes, 50),
      rv: rsi(closes, 14), av: atr(candles, 14) };
    const htfCloses = htfCandles.map((c) => c.close);
    const htfE20 = ema(htfCloses, 20), htfE50 = ema(htfCloses, 50);
    let htfCursor = -1;
    function htfDirectionAt(closeTime) {
      while (htfCursor + 1 < htfCandles.length) {
        const candidate = htfCandles[htfCursor + 1];
        const end = Number.isFinite(candidate.closeTime) && candidate.closeTime > candidate.time
          ? candidate.closeTime : candidate.time + higherTimeframeIntervalMs - 1;
        if (end > closeTime) break;
        htfCursor++;
      }
      if (htfCursor < 49 || htfCloses[htfCursor] === undefined) return "UNAVAILABLE";
      if (htfCloses[htfCursor] > htfE50[htfCursor] && htfE20[htfCursor] > htfE50[htfCursor]) return "BULLISH";
      if (htfCloses[htfCursor] < htfE50[htfCursor] && htfE20[htfCursor] < htfE50[htfCursor]) return "BEARISH";
      return "MIXED / NEUTRAL";
    }
    let signals = 0, targetFirst = 0, stopFirst = 0, timeouts = 0;
    const start = Math.max(80, candles.length - 1200);
    for (let i = start; i < candles.length - horizon - 1 && signals < 120; i++) {
      const candleCloseTime = Number.isFinite(candles[i].closeTime) && candles[i].closeTime > candles[i].time
        ? candles[i].closeTime : candles[i].time + intervalMs - 1;
      const directionAtSignal = htfDirectionAt(candleCloseTime);
      const setup = scoreAt(candles, i, indicators, directionAtSignal);
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
        // Conservative tie-break: if both levels occur inside one OHLC bar, count the stop first.
        if (hitStop) { outcome = "STOP"; break; }
        if (hitTarget) { outcome = "TARGET"; break; }
      }
      if (outcome === "TARGET") targetFirst++;
      else if (outcome === "STOP") stopFirst++;
      else timeouts++;
      i += horizon; // Avoid overlapping hypothetical positions inflating the observed sample.
    }
    const resolved = targetFirst + stopFirst;
    return {
      ready: true, candlesUsed: candles.length, higherTimeframeCandlesUsed: htfCandles.length, horizonBars: horizon, signals,
      targetFirst, stopFirst, timeouts, resolved,
      targetBeforeStopPct: resolved ? targetFirst / resolved * 100 : null,
      targetOfAllSignalsPct: signals ? targetFirst / signals * 100 : null,
      sampleQuality: signals < 10 ? "SMALL SAMPLE · NOT DECISION-GRADE" : resolved < 10 ? "TOO FEW RESOLVED CASES" : "HISTORICAL SAMPLE · NOT A LIVE-PROBABILITY ESTIMATE",
      caveat: "Chronological replay uses the same volume and higher-timeframe confirmation gates as the live forecast. Resolved cases exclude timeouts; fees, spread, slippage, funding, latency and execution errors are not modeled."
    };
  }

  return { buildScenarioForecast, backtestScenarioForecast };
});
