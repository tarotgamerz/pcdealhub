import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../public/trading-forecast.js", import.meta.url), "utf8");
const context = { window: {} };
runInNewContext(source, context, { filename: "trading-forecast.js" });
const buildForecast = context.window.TarotAIForecast?.buildForecast;
assert.equal(typeof buildForecast, "function", "forecast API must be exposed for the chart");

function makeCandles(count = 180, direction = 1) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const time = 1700000000000 + i * 300000;
    const close = 1000 + direction * i * 2 + Math.sin(i * 0.17) * 0.35;
    const open = close - direction * 0.45;
    out.push({ time, open, high: Math.max(open, close) + 1.5, low: Math.min(open, close) - 1.5, close, volume: 100 + (i % 17) });
  }
  return out;
}

test("bullish closed-candle context creates an upward six-bar projection", () => {
  const candles = makeCandles(180, 1);
  const visualCandle = { ...candles.at(-1), time: candles.at(-1).time + 300000, close: candles.at(-1).close + 0.2 };
  const result = buildForecast({ candles, visualCandle, interval: "5m", higherTrend: "BULLISH" });
  assert.equal(result.ready, true);
  assert.equal(result.direction, "UP");
  assert.equal(result.horizon, 6);
  assert.equal(result.path.length, 7);
  assert.equal(result.path[0].time, visualCandle.time / 1000);
  assert.ok(result.path.at(-1).time > result.path[0].time);
  assert.ok(result.targetPrice > result.startPrice);
  assert.ok(result.projectedMovePct > 0);
  assert.ok(Number.isFinite(result.invalidation));
});

test("bearish closed-candle context creates a downward projection", () => {
  const candles = makeCandles(180, -1);
  const result = buildForecast({ candles, interval: "15m", higherTrend: "BEARISH" });
  assert.equal(result.ready, true);
  assert.equal(result.direction, "DOWN");
  assert.ok(result.targetPrice < result.startPrice);
  assert.ok(result.projectedMovePct < 0);
  assert.ok(Number.isFinite(result.invalidation));
});

test("ATR envelope expands with the horizon and remains finite", () => {
  const result = buildForecast({ candles: makeCandles(180, 1), interval: "5m", higherTrend: "BULLISH" });
  assert.equal(result.upper.length, 7);
  assert.equal(result.lower.length, 7);
  const firstWidth = result.upper[1].value - result.lower[1].value;
  const lastWidth = result.upper.at(-1).value - result.lower.at(-1).value;
  assert.ok(lastWidth > firstWidth);
  assert.ok([...result.path, ...result.upper, ...result.lower].every(p => Number.isFinite(p.time) && Number.isFinite(p.value) && p.value > 0));
  assert.equal("winProbability" in result, false);
  assert.equal("probability" in result, false);
});

test("forecast fails closed on too little history, unsupported intervals, and duplicate timestamps", () => {
  assert.equal(buildForecast({ candles: makeCandles(79, 1), interval: "5m", higherTrend: "BULLISH" }).ready, false);
  assert.equal(buildForecast({ candles: makeCandles(180, 1), interval: "10m", higherTrend: "BULLISH" }).ready, false);
  const duplicate = makeCandles(180, 1);
  duplicate[80] = { ...duplicate[79] };
  assert.equal(buildForecast({ candles: duplicate, interval: "5m", higherTrend: "BULLISH" }).ready, false);
});

test("flat or contradictory technical context does not force a guaranteed directional call", () => {
  const candles = makeCandles(180, 0);
  const result = buildForecast({ candles, interval: "5m", higherTrend: "MIXED / NEUTRAL" });
  assert.equal(result.ready, true);
  assert.ok(["UP", "DOWN", "RANGE"].includes(result.direction));
  assert.equal(result.disclaimer.includes("not a guarantee"), true);
});
