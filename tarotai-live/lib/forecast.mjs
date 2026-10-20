const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

export function buildForecast(input, horizon = 3) {
  if (!Array.isArray(input) || input.length < 30) throw new Error("At least 30 valid candles are required.");
  const candles = input.slice(-120);
  const closes = candles.map(c => Number(c.close));
  const highs = candles.map(c => Number(c.high));
  const lows = candles.map(c => Number(c.low));
  const volumes = candles.map(c => Number(c.volume));
  if ([...closes, ...highs, ...lows, ...volumes].some(v => !Number.isFinite(v) || v < 0) || closes.some(v => v <= 0)) {
    throw new Error("Invalid candle series.");
  }
  const n = closes.length;
  const ema = (period) => {
    const alpha = 2 / (period + 1);
    return closes.slice(-Math.min(period * 3, n)).reduce((acc, price, i, arr) =>
      i === 0 ? price : alpha * price + (1 - alpha) * acc, closes[Math.max(0, n - Math.min(period * 3, n))]);
  };
  const e9 = ema(9), e21 = ema(21);
  const returns = closes.slice(1).map((v, i) => Math.log(v / closes[i]));
  const volatility = Math.sqrt(mean(returns.slice(-20).map(r => (r - mean(returns.slice(-20))) ** 2)));
  const recent = closes.slice(-20);
  const xMean = (recent.length - 1) / 2;
  const yMean = mean(recent);
  let numerator = 0, denominator = 0;
  recent.forEach((v, i) => { numerator += (i - xMean) * (v - yMean); denominator += (i - xMean) ** 2; });
  const slope = denominator ? numerator / denominator : 0;
  const price = closes[n - 1];
  const rawMove = (slope * horizon) + (e9 - e21) * 0.15;
  const maxMove = Math.max(price * 0.003, price * volatility * Math.sqrt(horizon) * 2.5);
  const projectedMove = clamp(rawMove, -maxMove, maxMove);
  const direction = projectedMove > price * 0.00015 ? "up" : projectedMove < -price * 0.00015 ? "down" : "sideways";
  const trendAgreement = Math.sign(slope) === Math.sign(e9 - e21) ? 1 : 0.5;
  const recentRange = Math.max(...highs.slice(-20)) - Math.min(...lows.slice(-20));
  const rangeRatio = recentRange / price;
  const volumeMean = mean(volumes.slice(-20));
  const volumeRatio = volumeMean > 0 ? volumes[n - 1] / volumeMean : 1;
  const confidence = Math.round(clamp(35 + 25 * trendAgreement + 15 * Math.min(1, Math.abs(slope) / Math.max(price * volatility, 1e-12)) - Math.min(20, volatility * 1000), 20, 70));
  return {
    symbol: null, direction, lastPrice: price,
    projectedPrice: price + projectedMove,
    projectedChangePct: projectedMove / price * 100,
    horizonCandles: horizon, confidenceScore: confidence,
    confidenceMeaning: "Heuristic signal-strength score, not a calibrated probability or guarantee.",
    indicators: { ema9: e9, ema21: e21, regressionSlope: slope, realizedVolatility: volatility, recentRangePct: rangeRatio * 100, latestVolumeVs20CandleMean: volumeRatio },
    invalidation: direction === "up" ? "A close below the recent 20-candle low weakens this bullish scenario." : direction === "down" ? "A close above the recent 20-candle high weakens this bearish scenario." : "A break beyond the recent 20-candle range invalidates the sideways scenario.",
    limitations: ["Candles-only estimate; does not include full order-flow, funding, liquidations, news, fees, or slippage.", "Not a trade instruction. Validate out of sample before use."]
  };
}
