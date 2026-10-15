(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TarotAIStrategyEnsemble = api;
})(typeof globalThis !== "undefined" ? globalThis : null, function () {
  "use strict";

  var MIN_CANDLES = 80;
  var BREAKOUT_LOOKBACK = 20;

  function ema(values, period) {
    var out = [];
    var alpha = 2 / (period + 1);
    var current = values[0];
    out.push(current);
    for (var i = 1; i < values.length; i++) {
      current = values[i] * alpha + current * (1 - alpha);
      out.push(current);
    }
    return out;
  }

  function rsi(values, period) {
    if (values.length <= period) return NaN;
    var gain = 0, loss = 0;
    for (var i = values.length - period; i < values.length; i++) {
      var delta = values[i] - values[i - 1];
      gain += Math.max(0, delta);
      loss += Math.max(0, -delta);
    }
    if (loss === 0) return gain === 0 ? 50 : 100;
    return 100 - 100 / (1 + gain / loss);
  }

  function mean(values) {
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function standardDeviation(values, average) {
    var variance = mean(values.map(function (value) { return Math.pow(value - average, 2); }));
    return Math.sqrt(variance);
  }

  function waitingResult(reason, regime) {
    return {
      status: "WAIT",
      bias: "WAIT",
      regime: regime || "UNAVAILABLE",
      longVotes: 0,
      shortVotes: 0,
      alignedVotes: 0,
      message: reason || "Not enough verified data for the strategy ensemble.",
      strategies: {
        trend: { name: "Trend following", bias: "WAIT", reason: reason || "Insufficient verified data." },
        breakout: { name: "Breakout / momentum", bias: "WAIT", reason: reason || "Insufficient verified data." },
        meanReversion: { name: "Mean reversion", bias: "WAIT", reason: reason || "Insufficient verified data." }
      },
      isProbability: false
    };
  }

  function evaluateStrategyEnsemble(options) {
    options = options || {};
    var candles = options.candles;
    var higher = String(options.higherTrend || "UNAVAILABLE").toUpperCase();
    if (options.fresh === false) return waitingResult("Stale or unsupported market data; all shadow votes withheld.");
    if (!Array.isArray(candles) || candles.length < MIN_CANDLES) {
      return waitingResult("Need at least " + MIN_CANDLES + " closed candles; no trade inference is made.");
    }

    var previousTime = -Infinity;
    for (var i = 0; i < candles.length; i++) {
      var candle = candles[i];
      if (!candle || ![candle.time, candle.open, candle.high, candle.low, candle.close].every(Number.isFinite) ||
          candle.time <= previousTime || candle.time <= 0 || candle.open <= 0 || candle.close <= 0 ||
          candle.low <= 0 || candle.high < Math.max(candle.open, candle.close, candle.low) ||
          candle.low > Math.min(candle.open, candle.close, candle.high)) {
        return waitingResult("Invalid or unordered OHLC data; all shadow votes withheld.");
      }
      previousTime = candle.time;
    }

    if (!["BULLISH", "BEARISH", "MIXED", "NEUTRAL", "UNAVAILABLE"].includes(higher)) {
      higher = "UNAVAILABLE";
    }

    var closes = candles.map(function (c) { return c.close; });
    var lastIndex = candles.length - 1;
    var last = candles[lastIndex];
    var ema9 = ema(closes, 9);
    var ema21 = ema(closes, 21);
    var ema50 = ema(closes, 50);
    var upSlope = ema9[lastIndex] > ema9[lastIndex - 3];
    var downSlope = ema9[lastIndex] < ema9[lastIndex - 3];
    var trendSpread = Math.abs(ema9[lastIndex] - ema21[lastIndex]) / last.close;
    var aboveTrend = last.close > ema50[lastIndex];
    var belowTrend = last.close < ema50[lastIndex];
    var regime = trendSpread > 0.0015 && aboveTrend && ema9[lastIndex] > ema21[lastIndex]
      ? "TRENDING_UP"
      : trendSpread > 0.0015 && belowTrend && ema9[lastIndex] < ema21[lastIndex]
        ? "TRENDING_DOWN"
        : "RANGE_OR_TRANSITION";

    var trendBias = "WAIT";
    var trendReason = "Trend alignment is incomplete.";
    if (higher === "BULLISH" && aboveTrend && ema9[lastIndex] > ema21[lastIndex] && upSlope) {
      trendBias = "LONG";
      trendReason = "Bullish higher-timeframe direction, price above EMA 50, EMA 9 above EMA 21 and rising.";
    } else if (higher === "BEARISH" && belowTrend && ema9[lastIndex] < ema21[lastIndex] && downSlope) {
      trendBias = "SHORT";
      trendReason = "Bearish higher-timeframe direction, price below EMA 50, EMA 9 below EMA 21 and falling.";
    } else if (higher === "UNAVAILABLE") {
      trendReason = "Higher-timeframe direction is unavailable; trend vote withheld.";
    }

    var prior = candles.slice(-(BREAKOUT_LOOKBACK + 1), -1);
    var priorHigh = Math.max.apply(null, prior.map(function (c) { return c.high; }));
    var priorLow = Math.min.apply(null, prior.map(function (c) { return c.low; }));
    var breakoutBias = "WAIT";
    var breakoutReason = "No confirmed close beyond the previous " + BREAKOUT_LOOKBACK + "-candle range.";
    if (prior.length === BREAKOUT_LOOKBACK && last.close > priorHigh && ema9[lastIndex] > ema21[lastIndex] && upSlope) {
      breakoutBias = "LONG";
      breakoutReason = "Closed candle broke above the prior range with aligned, rising short-term trend.";
    } else if (prior.length === BREAKOUT_LOOKBACK && last.close < priorLow && ema9[lastIndex] < ema21[lastIndex] && downSlope) {
      breakoutBias = "SHORT";
      breakoutReason = "Closed candle broke below the prior range with aligned, falling short-term trend.";
    }

    var window20 = closes.slice(-20);
    var average20 = mean(window20);
    var sd20 = standardDeviation(window20, average20);
    var zScore = sd20 > 0 ? (last.close - average20) / sd20 : 0;
    var rsi14 = rsi(closes, 14);
    var meanBias = "WAIT";
    var meanReason = "Mean-reversion vote is restricted to range/transition conditions and stretched price.";
    if (regime === "RANGE_OR_TRANSITION" && Number.isFinite(rsi14) && zScore <= -1.5 && rsi14 <= 35) {
      meanBias = "LONG";
      meanReason = "Range/transition regime with price at least 1.5 standard deviations below its 20-candle mean and RSI at or below 35.";
    } else if (regime === "RANGE_OR_TRANSITION" && Number.isFinite(rsi14) && zScore >= 1.5 && rsi14 >= 65) {
      meanBias = "SHORT";
      meanReason = "Range/transition regime with price at least 1.5 standard deviations above its 20-candle mean and RSI at or above 65.";
    }

    var votes = [
      { name: "Trend following", bias: trendBias, reason: trendReason },
      { name: "Breakout / momentum", bias: breakoutBias, reason: breakoutReason },
      { name: "Mean reversion", bias: meanBias, reason: meanReason }
    ];
    var longVotes = votes.filter(function (v) { return v.bias === "LONG"; }).length;
    var shortVotes = votes.filter(function (v) { return v.bias === "SHORT"; }).length;
    var bias = longVotes >= 2 && shortVotes === 0 ? "LONG"
      : shortVotes >= 2 && longVotes === 0 ? "SHORT" : "WAIT";
    var alignedVotes = bias === "LONG" ? longVotes : bias === "SHORT" ? shortVotes : Math.max(longVotes, shortVotes);
    var message = bias === "WAIT"
      ? "No unopposed two-strategy agreement. WAIT is intentional."
      : alignedVotes + " of 3 rule strategies align " + bias + "; this is rule agreement, not a probability estimate.";
    return {
      status: "READY",
      bias: bias,
      regime: regime,
      longVotes: longVotes,
      shortVotes: shortVotes,
      alignedVotes: alignedVotes,
      message: message,
      strategies: { trend: votes[0], breakout: votes[1], meanReversion: votes[2] },
      diagnostics: { ema9: ema9[lastIndex], ema21: ema21[lastIndex], ema50: ema50[lastIndex], rsi14: rsi14, zScore20: zScore, priorHigh: priorHigh, priorLow: priorLow },
      isProbability: false
    };
  }

  return { evaluateStrategyEnsemble: evaluateStrategyEnsemble, minimumCandles: MIN_CANDLES };
});
