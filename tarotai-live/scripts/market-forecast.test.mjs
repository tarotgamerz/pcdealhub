import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { buildMarketForecast } = require("../public/market-forecast.js");
const desk = readFileSync(new URL("../public/trading-desk.html", import.meta.url), "utf8");

function makeCandles(direction = 1, count = 120, options = {}) {
  const intervalMs = options.intervalMs || 60_000, start = options.start || 1_750_000_000_000, candles = [];
  let previous = options.base || 1000;
  for (let i = 0; i < count; i++) {
    const close = (options.base || 1000) + direction * i * (options.step || 1.5) + Math.sin(i * 0.37) * 0.12;
    const open = previous;
    candles.push({ time: start + i * intervalMs, open, high: Math.max(open, close) + 0.45, low: Math.min(open, close) - 0.45, close, volume: 100 + i, closeTime: start + i * intervalMs + intervalMs - 1 });
    previous = close;
  }
  return candles;
}

test("forecast uses closed candles and plots four future points with measurable ATR envelopes", () => {
  const candles = makeCandles(1), asOf = candles.at(-1).closeTime + 500;
  const f = buildMarketForecast(candles, { intervalMs: 60_000, asOf, higherTrend: "BULLISH" });
  assert.equal(f.ready, true); assert.equal(f.direction, "BULLISH"); assert.equal(f.points.length, 4);
  assert.ok(f.points.every((p, i) => p.time > candles.at(-1).time && Number.isFinite(p.price) && p.upper > p.price && p.lower < p.price && (!i || p.time > f.points[i - 1].time)));
  assert.equal(f.calibratedProbability, null); assert.equal(f.paperOnly, true); assert.equal(f.tradeEligible, false);
  assert.ok(Number.isFinite(f.projectedMovePct) && f.projectedMovePct >= 0);
});

test("forecast detects a bearish scenario from falling closed candles", () => {
  const candles = makeCandles(-1), asOf = candles.at(-1).closeTime + 500;
  const f = buildMarketForecast(candles, { intervalMs: 60_000, asOf, higherTrend: "BEARISH" });
  assert.equal(f.ready, true); assert.equal(f.direction, "BEARISH");
  assert.ok(f.triggerPrice < f.referencePrice); assert.ok(f.invalidationPrice > f.referencePrice);
});

test("flat or mixed candles produce a wait/range forecast instead of a forced directional call", () => {
  const candles = makeCandles(0, 120, { step: 0 });
  const flat = candles.map((c, i) => ({ ...c, open: 1000 + Math.sin(i * 0.7) * 0.1, close: 1000 + Math.sin(i * 0.7) * 0.1, high: 1000.7, low: 999.3 }));
  const f = buildMarketForecast(flat, { intervalMs: 60_000, asOf: flat.at(-1).closeTime + 500, higherTrend: "MIXED / NEUTRAL" });
  assert.equal(f.ready, true); assert.equal(f.direction, "MIXED / RANGE"); assert.equal(f.targetPrice, null);
  assert.ok(f.rangeHigh > f.rangeLow);
});

test("stale market data suppresses projected lines and never presents a current forecast", () => {
  const candles = makeCandles(1), asOf = candles.at(-1).closeTime + 5 * 60_000;
  const f = buildMarketForecast(candles, { intervalMs: 60_000, asOf, higherTrend: "BULLISH" });
  assert.equal(f.ready, false); assert.equal(f.stale, true); assert.match(f.reason, /stale/i); assert.deepEqual(f.points, []);
});

test("live opposing order flow downgrades a directional technical setup to conflict", () => {
  const candles = makeCandles(1), asOf = candles.at(-1).closeTime + 500;
  const f = buildMarketForecast(candles, { intervalMs: 60_000, asOf, higherTrend: "BULLISH", orderFlow: { depthFresh: true, tradeFresh: true, bias: "SELLERS LEADING", updatedAt: new Date(asOf).toISOString() } });
  assert.equal(f.ready, true); assert.equal(f.technicalDirection, "BULLISH"); assert.equal(f.direction, "MIXED / FLOW CONFLICT");
  assert.equal(f.targetPrice, null); assert.match(f.flowStatus, /CONFLICT/);
});

test("insufficient and delayed reference-only data fail closed", () => {
  const small = makeCandles(1, 60);
  assert.equal(buildMarketForecast(small, { intervalMs: 60_000, asOf: small.at(-1).closeTime + 500 }).ready, false);
  const enough = makeCandles(1);
  assert.equal(buildMarketForecast(enough, { intervalMs: 60_000, asOf: enough.at(-1).closeTime + 500, referenceOnly: true }).status, "REFERENCE ONLY");
});

test("Trading Desk adds chart series, live order-flow context and transparent scenario measurements", () => {
  assert.match(desk, /<script src="\/market-forecast\.js"><\/script>/); assert.match(desk, /forecastPathSeries=chart\.addLineSeries/);
  assert.match(desk, /forecastUpperSeries=chart\.addLineSeries/); assert.match(desk, /drawForecastOverlay\(nextMoveForecast\)/);
  assert.match(desk, /window\.tarotaiOrderFlowSummary/); assert.match(desk, /liveForecastInvalidation/); assert.match(desk, /not a calibrated probability/i);
});