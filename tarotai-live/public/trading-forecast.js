(function attachTarotAIForecast(root) {
  "use strict";
  const INTERVAL_MS = { "1m":60000, "3m":180000, "5m":300000, "15m":900000, "30m":1800000, "1h":3600000, "2h":7200000, "4h":14400000, "1d":86400000 };
  const finite = (n) => Number.isFinite(n) && typeof n === "number";
  const ema = (values, period) => {
    if (!values.length) return [];
    const k = 2 / (period + 1), out = [values[0]];
    for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
    return out;
  };
  const rsi = (values, period = 14) => {
    const out = Array(values.length).fill(NaN);
    if (values.length <= period) return out;
    let gain = 0, loss = 0;
    for (let i = 1; i <= period; i++) {
      const d = values[i] - values[i - 1]; gain += Math.max(0, d); loss += Math.max(0, -d);
    }
    gain /= period; loss /= period; out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    for (let i = period + 1; i < values.length; i++) {
      const d = values[i] - values[i - 1];
      gain = (gain * (period - 1) + Math.max(0, d)) / period;
      loss = (loss * (period - 1) + Math.max(0, -d)) / period;
      out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    }
    return out;
  };
  const atr = (candles, period = 14) => {
    const tr = candles.map((c, i) => i === 0 ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close)));
    if (tr.length < period) return NaN;
    let value = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < tr.length; i++) value = (value * (period - 1) + tr[i]) / period;
    return value;
  };
  function buildForecast(input) {
    const opts = input && typeof input === "object" ? input : {};
    const interval = opts.interval;
    const stepMs = INTERVAL_MS[interval];
    const candles = Array.isArray(opts.candles) ? opts.candles.filter(c => c && [c.time,c.open,c.high,c.low,c.close].every(finite) && c.time > 0 && c.low > 0 && c.high >= Math.max(c.open,c.close,c.low) && c.low <= Math.min(c.open,c.close,c.high)).slice().sort((a,b) => a.time - b.time) : [];
    if (!stepMs) return { ready:false, reason:"Unsupported timeframe.", direction:"RANGE" };
    if (candles.length < 80) return { ready:false, reason:"At least 80 closed candles are required.", direction:"RANGE" };
    if (candles.some((c,i) => i > 0 && c.time <= candles[i-1].time)) return { ready:false, reason:"Candle timestamps must be unique.", direction:"RANGE" };
    const values = candles.map(c => c.close), i = candles.length - 1, last = candles[i];
    const e9 = ema(values,9), e21 = ema(values,21), e50 = ema(values,50), rv = rsi(values,14), volatility = atr(candles,14);
    if (![e9[i],e21[i],e50[i],rv[i],volatility].every(finite) || volatility <= 0) return { ready:false, reason:"Forecast indicators are incomplete.", direction:"RANGE" };
    const htf = String(opts.higherTrend || "MIXED / NEUTRAL").toUpperCase();
    const upVotes = [e9[i] > e21[i], last.close > e50[i], e9[i] > e9[Math.max(0,i-4)], rv[i] >= 52 && rv[i] <= 70, htf === "BULLISH"].filter(Boolean).length;
    const downVotes = [e9[i] < e21[i], last.close < e50[i], e9[i] < e9[Math.max(0,i-4)], rv[i] >= 30 && rv[i] <= 48, htf === "BEARISH"].filter(Boolean).length;
    const direction = upVotes >= 3 && upVotes > downVotes ? "UP" : downVotes >= 3 && downVotes > upVotes ? "DOWN" : "RANGE";
    const selectedVotes = direction === "UP" ? upVotes : direction === "DOWN" ? downVotes : Math.max(upVotes, downVotes);
    const horizon = 6;
    const visual = opts.visualCandle && finite(opts.visualCandle.time) && finite(opts.visualCandle.close) && opts.visualCandle.time > 0 && opts.visualCandle.close > 0 ? opts.visualCandle : last;
    const startPrice = visual.close, startTimeMs = visual.time;
    const priceSlope = (last.close - candles[Math.max(0,i-4)].close) / Math.max(1, Math.min(4,i));
    const emaSlope = (e9[i] - e9[Math.max(0,i-4)]) / Math.max(1, Math.min(4,i));
    let slope = priceSlope * 0.55 + emaSlope * 0.45;
    slope = Math.max(-volatility * 0.28, Math.min(volatility * 0.28, slope));
    if (direction === "UP") slope = Math.max(volatility * 0.045, slope);
    else if (direction === "DOWN") slope = Math.min(-volatility * 0.045, slope);
    else slope = Math.max(-volatility * 0.035, Math.min(volatility * 0.035, slope));
    const prior = candles.slice(Math.max(0, i-19), i+1);
    const priorLow = Math.min(...prior.map(c => c.low)), priorHigh = Math.max(...prior.map(c => c.high));
    const support = prior.filter(c => c.low < startPrice).map(c => c.low).sort((a,b) => b-a)[0];
    const resistance = prior.filter(c => c.high > startPrice).map(c => c.high).sort((a,b) => a-b)[0];
    const path = [], upper = [], lower = [];
    for (let step = 0; step <= horizon; step++) {
      const time = Math.floor(startTimeMs / 1000) + Math.round(stepMs / 1000) * step;
      const mid = startPrice + slope * step;
      const band = volatility * 0.45 * Math.sqrt(step);
      path.push({ time, value:mid });
      upper.push({ time, value:mid + band });
      lower.push({ time, value:Math.max(1, mid - band) });
    }
    const targetPrice = path[path.length - 1].value;
    const rangeLow = lower[lower.length - 1].value, rangeHigh = upper[upper.length - 1].value;
    const invalidation = direction === "UP" ? (Number.isFinite(support) ? support : Math.max(1,startPrice-volatility*1.5))
      : direction === "DOWN" ? (Number.isFinite(resistance) ? resistance : startPrice+volatility*1.5)
      : { below:priorLow, above:priorHigh };
    return {
      ready:true, direction, horizon, interval, startPrice, targetPrice, rangeLow, rangeHigh, atr:volatility,
      atrPct:volatility/startPrice*100, projectedMove:targetPrice-startPrice, projectedMovePct:(targetPrice/startPrice-1)*100,
      invalidation, alignmentVotes:selectedVotes, totalVotes:5, upVotes, downVotes, path, upper, lower,
      method:"EMA 9/21/50 alignment, RSI, higher-timeframe bias, recent slope and ATR envelope",
      disclaimer:"Conditional technical scenario only. ATR measures volatility, not direction; the envelope is not a calibrated confidence interval and is not a guarantee."
    };
  }
  root.TarotAIForecast = { buildForecast };
})(typeof window !== "undefined" ? window : globalThis);
