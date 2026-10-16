(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) { root.tarotaiBuildMarketForecast = api.buildMarketForecast; root.tarotaiEvaluateForecastWalkForward = api.evaluateForecastWalkForward; }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : null), function() {
  "use strict";
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const finite = x => x !== null && x !== undefined && x !== "" && Number.isFinite(Number(x));
  const asMilliseconds = x => Number(x) > 1e12 ? Number(x) : Number(x) * 1000;
  function ema(values, period) {
    if (!values.length) return [];
    const alpha = 2 / (period + 1), out = [values[0]];
    for (let i = 1; i < values.length; i++) out.push(values[i] * alpha + out[i - 1] * (1 - alpha));
    return out;
  }
  function rsi(values, period) {
    if (values.length <= period) return NaN;
    let gain = 0, loss = 0;
    for (let i = 1; i <= period; i++) {
      const d = values[i] - values[i - 1];
      gain += Math.max(0, d); loss += Math.max(0, -d);
    }
    gain /= period; loss /= period;
    for (let i = period + 1; i < values.length; i++) {
      const d = values[i] - values[i - 1];
      gain = (gain * (period - 1) + Math.max(0, d)) / period;
      loss = (loss * (period - 1) + Math.max(0, -d)) / period;
    }
    if (loss === 0) return gain === 0 ? 50 : 100;
    return 100 - 100 / (1 + gain / loss);
  }
  function atr(candles, period) {
    if (candles.length < period + 1) return NaN;
    const trs = [];
    for (let i = candles.length - period; i < candles.length; i++) {
      const c = candles[i], prev = candles[i - 1];
      trs.push(Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close)));
    }
    return trs.reduce((sum, value) => sum + value, 0) / trs.length;
  }
  function regressionSlope(values) {
    const n = Math.min(12, values.length), slice = values.slice(-n);
    if (n < 3) return NaN;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sx += i; sy += slice[i]; sxx += i * i; sxy += i * slice[i]; }
    const den = n * sxx - sx * sx;
    return den ? (n * sxy - sx * sy) / den : 0;
  }
  function unavailable(reason, extra = {}) {
    return { ready: false, status: "WAIT", direction: "WAIT", technicalDirection: "WAIT", reason, points: [], targetPrice: null, triggerPrice: null, invalidationPrice: null, support: null, resistance: null, ...extra };
  }
  function buildMarketForecast(input, options = {}) {
    const intervalMs = finite(options.intervalMs) && Number(options.intervalMs) > 0 ? Number(options.intervalMs) : 300000;
    const asOf = finite(options.asOf) ? Number(options.asOf) : Date.now();
    if (options.referenceOnly) return unavailable("Reference-only or delayed market data: no actionable next-move scenario is issued.", { status: "REFERENCE ONLY" });
    if (!Array.isArray(input)) return unavailable("Closed-candle data is unavailable.");
    const seen = new Set(), bars = [];
    for (const raw of input) {
      if (!raw || !["time", "open", "high", "low", "close"].every(k => finite(raw[k]))) continue;
      const time = Number(raw.time), open = Number(raw.open), high = Number(raw.high), low = Number(raw.low), close = Number(raw.close);
      const unitMs = time > 1e12 ? 1 : 1000;
      const closeTimeMs = finite(raw.closeTime) ? asMilliseconds(raw.closeTime) : asMilliseconds(time) + intervalMs - 1;
      const volume = finite(raw.volume) ? Number(raw.volume) : 0;
      if (!(time > 0 && open > 0 && close > 0 && low > 0 && volume >= 0 && high >= Math.max(open, close, low) && low <= Math.min(open, close, high))) continue;
      if (seen.has(time) || closeTimeMs > asOf) continue;
      seen.add(time); bars.push({ time, open, high, low, close, volume, closeTimeMs, unitMs });
    }
    bars.sort((a, b) => a.time - b.time);
    const clean = bars.slice(-240);
    if (clean.length < 80) return unavailable("Need at least 80 valid closed candles; found " + clean.length + ".", { count: clean.length });
    const last = clean[clean.length - 1], ageMs = Math.max(0, asOf - last.closeTimeMs);
    if (ageMs > intervalMs * 2 + 60000) return unavailable("Market data is stale (" + Math.round(ageMs / 1000) + "s since the last closed candle). Waiting for fresh data.", { stale: true, count: clean.length, ageMs, lastTime: last.time });
    const closes = clean.map(c => c.close), e9 = ema(closes, 9), e21 = ema(closes, 21), e50 = ema(closes, 50);
    const lastIndex = clean.length - 1, close = closes[lastIndex], atrNow = atr(clean, 14), rsiNow = rsi(closes, 14);
    if (!Number.isFinite(atrNow) || atrNow <= 0 || !Number.isFinite(rsiNow)) return unavailable("ATR/RSI could not be computed reliably.", { count: clean.length, lastTime: last.time });
    const slope = regressionSlope(closes), momentum3 = close - closes[Math.max(0, lastIndex - 3)];
    const slopeAtr = slope / atrNow, momentumAtr = momentum3 / atrNow;
    const prior = clean.slice(Math.max(0, clean.length - 21), clean.length - 1);
    const priorHigh = Math.max(...prior.map(c => c.high)), priorLow = Math.min(...prior.map(c => c.low));
    const higherTrend = String(options.higherTrend || "UNAVAILABLE").toUpperCase();
    const longChecks = [
      e9[lastIndex] > e21[lastIndex], close > e50[lastIndex], slopeAtr > 0.015,
      momentumAtr > 0.08, rsiNow >= 52 && rsiNow <= 74,
      higherTrend === "BULLISH", close > priorHigh
    ];
    const shortChecks = [
      e9[lastIndex] < e21[lastIndex], close < e50[lastIndex], slopeAtr < -0.015,
      momentumAtr < -0.08, rsiNow >= 26 && rsiNow <= 48,
      higherTrend === "BEARISH", close < priorLow
    ];
    const longScore = longChecks.filter(Boolean).length, shortScore = shortChecks.filter(Boolean).length;
    let technicalDirection = "MIXED / RANGE";
    if (higherTrend === "BULLISH" && longScore >= 4 && longScore - shortScore >= 2) technicalDirection = "BULLISH";
    else if (higherTrend === "BEARISH" && shortScore >= 4 && shortScore - longScore >= 2) technicalDirection = "BEARISH";
    const flow = options.orderFlow && typeof options.orderFlow === "object" ? options.orderFlow : null;
    const flowUpdatedAt = flow && Date.parse(flow.updatedAt);
    const flowFresh = !!flow && flow.depthFresh === true && flow.tradeFresh === true && Number.isFinite(flowUpdatedAt) && asOf - flowUpdatedAt >= -1000 && asOf - flowUpdatedAt <= 5000;
    const flowBias = flowFresh ? String(flow.bias || "MIXED / NO EDGE").toUpperCase() : "ORDER FLOW UNAVAILABLE / STALE";
    const flowDirection = flowBias === "BUYERS LEADING" ? "BULLISH" : flowBias === "SELLERS LEADING" ? "BEARISH" : null;
    const flowConflict = !!flowDirection && ((technicalDirection === "BULLISH" && flowDirection === "BEARISH") || (technicalDirection === "BEARISH" && flowDirection === "BULLISH"));
    const flowAligned = !!flowDirection && technicalDirection === flowDirection;
    const direction = flowConflict ? "MIXED / FLOW CONFLICT" : technicalDirection;
    const structureSupport = finite(options.support) && Number(options.support) < close ? Number(options.support) : priorLow < close ? priorLow : null;
    const structureResistance = finite(options.resistance) && Number(options.resistance) > close ? Number(options.resistance) : priorHigh > close ? priorHigh : null;
    const recent = clean.slice(-5), recentThree = clean.slice(-3);
    const recentLow = Math.min(...recent.map(c => c.low)), recentHigh = Math.max(...recent.map(c => c.high));
    const technicalScore = technicalDirection === "BULLISH" ? longScore : technicalDirection === "BEARISH" ? shortScore : Math.max(longScore, shortScore);
    const maxTechnicalScore = 7;
    let drift = clamp(slope * 0.58 + (momentum3 / 3) * 0.2, -atrNow * 0.42, atrNow * 0.42);
    if (technicalDirection === "BULLISH" && !flowConflict) drift = Math.max(drift, atrNow * 0.06);
    else if (technicalDirection === "BEARISH" && !flowConflict) drift = Math.min(drift, -atrNow * 0.06);
    else if (flowConflict) drift = clamp(slope * 0.16, -atrNow * 0.12, atrNow * 0.12);
    else drift = clamp(drift, -atrNow * 0.12, atrNow * 0.12);
    const horizonBars = clamp(Math.floor(Number(options.horizonBars) || 4), 2, 12), timeStep = intervalMs / last.unitMs;
    const points = [];
    for (let step = 1; step <= horizonBars; step++) {
      const price = close + drift * step;
      const width = atrNow * (0.62 + 0.16 * Math.sqrt(step));
      points.push({ step, time: last.time + timeStep * step, price, upper: price + width, lower: price - width });
    }
    const endpoint = points[points.length - 1].price;
    const directional = direction === "BULLISH" || direction === "BEARISH";
    let targetPrice = null, triggerPrice = null, invalidationPrice = null;
    if (directional) {
      targetPrice = direction === "BULLISH"
        ? (structureResistance !== null && structureResistance < endpoint ? structureResistance : endpoint)
        : (structureSupport !== null && structureSupport > endpoint ? structureSupport : endpoint);
      if (!(direction === "BULLISH" ? targetPrice > close : targetPrice < close)) targetPrice = endpoint;
      const highs3 = Math.max(...recentThree.map(c => c.high)), lows3 = Math.min(...recentThree.map(c => c.low));
      triggerPrice = direction === "BULLISH" ? Math.max(highs3, close) + atrNow * 0.05 : Math.min(lows3, close) - atrNow * 0.05;
      invalidationPrice = direction === "BULLISH" ? (structureSupport !== null ? structureSupport : recentLow) : (structureResistance !== null ? structureResistance : recentHigh);
    }
    const strengthLabel = technicalScore >= 6 && (flowAligned || !flowFresh) ? "Strong rule agreement" : technicalScore >= 5 ? "Moderate rule agreement" : "Weak / mixed rule agreement";
    const evidence = [];
    evidence.push("EMA 9 is " + (e9[lastIndex] > e21[lastIndex] ? "above" : e9[lastIndex] < e21[lastIndex] ? "below" : "near") + " EMA 21");
    evidence.push("last close is " + (close > e50[lastIndex] ? "above" : "below") + " EMA 50");
    evidence.push("12-bar regression slope is " + (slope > 0 ? "rising" : slope < 0 ? "falling" : "flat") + " at " + slopeAtr.toFixed(2) + " ATR/bar");
    evidence.push("RSI 14 = " + rsiNow.toFixed(1));
    evidence.push("higher timeframe = " + higherTrend);
    evidence.push("order flow = " + (flowFresh ? flowBias + (flowAligned ? " (aligned)" : flowConflict ? " (conflicts)" : "") : flowBias));
    if (close > priorHigh) evidence.push("closed above the prior 20-bar high");
    else if (close < priorLow) evidence.push("closed below the prior 20-bar low");
    const moveReference = directional ? targetPrice : endpoint;
    const move = moveReference - close;
    const highs3 = Math.max(...recentThree.map(c => c.high)), lows3 = Math.min(...recentThree.map(c => c.low));
    const bullishTrigger = Math.max(highs3, close) + atrNow * 0.05;
    const bearishTrigger = Math.min(lows3, close) - atrNow * 0.05;
    const bullishInvalidation = structureSupport !== null ? structureSupport : recentLow;
    const bearishInvalidation = structureResistance !== null ? structureResistance : recentHigh;
    const bullishTarget = Math.max(priorHigh + atrNow * 0.75, close + atrNow * 1.25, bullishTrigger + atrNow * 0.5);
    const bearishTarget = Math.min(priorLow - atrNow * 0.75, close - atrNow * 1.25, bearishTrigger - atrNow * 0.5);
    const makeConditionalPath = endPrice => Array.from({ length: horizonBars }, (_, index) => {
      const step = index + 1, price = close + (endPrice - close) * step / horizonBars;
      const width = atrNow * (0.62 + 0.16 * Math.sqrt(step));
      return { step, time: last.time + timeStep * step, price, upper: price + width, lower: price - width };
    });
    const scenarioPaths = {
      base: { key: "base", title: directional ? direction + " BASE SCENARIO" : "MIXED / RANGE · WAIT", side: directional ? direction : "WAIT",
        triggerPrice, targetPrice: directional ? targetPrice : null, invalidationPrice: directional ? invalidationPrice : null, points },
      bullish: { key: "bullish", title: "CONDITIONAL BULLISH BREAKOUT", side: "LONG", triggerPrice: bullishTrigger, targetPrice: bullishTarget,
        invalidationPrice: bullishInvalidation, activation: "Only after a completed candle confirms acceptance above the breakout trigger.", points: makeConditionalPath(bullishTarget) },
      bearish: { key: "bearish", title: "CONDITIONAL BEARISH BREAKDOWN", side: "SHORT", triggerPrice: bearishTrigger, targetPrice: bearishTarget,
        invalidationPrice: bearishInvalidation, activation: "Only after a completed candle confirms acceptance below the breakdown trigger.", points: makeConditionalPath(bearishTarget) }
    };
    return {
      ready: true, status: "TECHNICAL SCENARIO · SHADOW ONLY", direction, technicalDirection,
      flowConflict, flowFresh, flowBias, flowStatus: flowFresh ? flowBias + (flowAligned ? " · ALIGNED" : flowConflict ? " · CONFLICT" : " · NO CONFIRMED ALIGNMENT") : "NOT USED · DEPTH/TRADE FEED STALE OR UNAVAILABLE",
      technicalScore, maxTechnicalScore, longScore, shortScore, strengthLabel,
      referencePrice: close, lastTime: last.time, lastClosedAt: last.closeTimeMs,
      ageMs, count: clean.length, atr: atrNow, rsi: rsiNow, slopeAtr, horizonBars,
      support: structureSupport, resistance: structureResistance,
      targetPrice: directional ? targetPrice : null, triggerPrice, invalidationPrice,
      projectedEndpoint: endpoint, projectedMove: move, projectedMovePct: Math.abs(move / close) * 100,
      projectedMoveAtr: Math.abs(move) / atrNow, rangeLow: points[points.length - 1].lower,
      rangeHigh: points[points.length - 1].upper, points, scenarios: scenarioPaths, evidence,
      calibratedProbability: null, paperOnly: true, tradeEligible: false
    };
  }

  function normalizeBars(input, intervalMs) {
    if (!Array.isArray(input)) return [];
    const seen = new Set(), bars = [];
    for (const raw of input) {
      if (!raw || !["time", "open", "high", "low", "close"].every(k => finite(raw[k]))) continue;
      const time = asMilliseconds(raw.time), open = Number(raw.open), high = Number(raw.high), low = Number(raw.low), close = Number(raw.close);
      const closeTime = finite(raw.closeTime) ? asMilliseconds(raw.closeTime) : time + intervalMs - 1;
      const volume = finite(raw.volume) ? Number(raw.volume) : 0;
      if (!(time > 0 && closeTime >= time && open > 0 && close > 0 && low > 0 && volume >= 0 &&
          high >= Math.max(open, close, low) && low <= Math.min(open, close, high)) || seen.has(time)) continue;
      seen.add(time); bars.push({ ...raw, time, open, high, low, close, volume, closeTime });
    }
    return bars.sort((a, b) => a.time - b.time);
  }

  function inferHistoricalHigherTrend(input) {
    if (input.length < 55) return "UNAVAILABLE";
    const closes = input.map(c => c.close), e20 = ema(closes, 20), e50 = ema(closes, 50), i = closes.length - 1;
    return closes[i] > e50[i] && e20[i] > e50[i] ? "BULLISH"
      : closes[i] < e50[i] && e20[i] < e50[i] ? "BEARISH" : "MIXED / NEUTRAL";
  }

  function evaluateForecastWalkForward(input, higherInput, options = {}) {
    const intervalMs = finite(options.intervalMs) && Number(options.intervalMs) > 0 ? Number(options.intervalMs) : 300000;
    const higherIntervalMs = finite(options.higherIntervalMs) && Number(options.higherIntervalMs) > 0 ? Number(options.higherIntervalMs) : null;
    const horizonBars = clamp(Math.floor(Number(options.horizonBars) || 4), 2, 12);
    const bars = normalizeBars(input, intervalMs).slice(-1000);
    const higherBars = normalizeBars(higherInput, higherIntervalMs || intervalMs).slice(-2000);
    const result = {
      method: "past-only rolling walk-forward; higher-timeframe bars time-filtered at every origin",
      horizonBars, forecastOrigins: 0, directionalCalls: 0, sampleSize: 0, correct: 0,
      directionalHitRatePct: null, averageSignedReturnPct: null, meanAbsoluteEndpointErrorPct: null,
      minimumMoveAtr: 0.15, minimumMoveFloorPct: 0.02,
      hitDefinition: "A directional hit requires an actual close-to-close move in the forecast direction of at least max(0.02%, 0.15 ATR at the forecast origin). Smaller moves count as misses.",
      meetsMinimumSample: false, status: "BUILDING SAMPLE",
      notice: "A directional hit requires at least max(0.02%, 0.15 ATR at the forecast origin) in the forecast direction; smaller moves count as misses. This is not calibrated probability or net profit and excludes fees, spread, slippage and live order-flow snapshots."
    };
    if (bars.length < 100) { result.notice = "Need at least 100 valid chronological main-timeframe candles; no historical performance claim is made."; return result; }
    const resolved = [];
    for (let i = 80; i + horizonBars < bars.length; i += horizonBars) {
      const origin = bars[i], originEnd = origin.closeTime, prefix = bars.slice(0, i + 1);
      const knownHigher = higherBars.filter(c => c.closeTime <= originEnd);
      const higherTrend = inferHistoricalHigherTrend(knownHigher);
      result.forecastOrigins++;
      const forecast = buildMarketForecast(prefix, {
        intervalMs, horizonBars, asOf: originEnd + 500, higherTrend, marketFresh: true
      });
      if (!forecast.ready || !["BULLISH", "BEARISH"].includes(forecast.direction)) continue;
      const future = bars[i + horizonBars];
      const actualReturnPct = (future.close / origin.close - 1) * 100;
      const signedReturnPct = forecast.direction === "BULLISH" ? actualReturnPct : -actualReturnPct;
      if (!Number.isFinite(signedReturnPct) || !Number.isFinite(forecast.atr) || forecast.atr <= 0 || origin.close <= 0) continue;
      // Do not inflate the score by counting an insignificant tick in the predicted direction as a useful hit.
      const minimumMovePct = Math.max(result.minimumMoveFloorPct, forecast.atr / origin.close * 100 * result.minimumMoveAtr);
      const predictedEnd = Number(forecast.projectedEndpoint), endpointErrorPct = Number.isFinite(predictedEnd)
        ? Math.abs(future.close - predictedEnd) / origin.close * 100 : null;
      resolved.push({ correct: signedReturnPct >= minimumMovePct, signedReturnPct, endpointErrorPct, minimumMovePct });
    }
    result.directionalCalls = resolved.length; result.sampleSize = resolved.length;
    result.correct = resolved.filter(x => x.correct).length;
    result.directionalHitRatePct = resolved.length ? result.correct / resolved.length * 100 : null;
    result.averageSignedReturnPct = resolved.length ? resolved.reduce((sum, x) => sum + x.signedReturnPct, 0) / resolved.length : null;
    const endpointErrors = resolved.map(x => x.endpointErrorPct).filter(Number.isFinite);
    result.meanAbsoluteEndpointErrorPct = endpointErrors.length ? endpointErrors.reduce((sum, x) => sum + x, 0) / endpointErrors.length : null;
    result.meetsMinimumSample = resolved.length >= 20;
    result.status = result.meetsMinimumSample ? "HISTORICAL SAMPLE READY" : "BUILDING SAMPLE";
    return result;
  }

  return { buildMarketForecast, evaluateForecastWalkForward };
});