import test from "node:test";
import assert from "node:assert/strict";
import { buildForecast } from "../lib/forecast.mjs";

function candles(count = 80) {
  return Array.from({ length: count }, (_, i) => {
    const close = 60000 + i * 12 + Math.sin(i / 3) * 30;
    return { open: close - 5, high: close + 20, low: close - 20, close, volume: 100 + i };
  });
}

test("forecast returns finite bounded read-only signal fields", () => {
  const result = buildForecast(candles(), 3);
  assert.ok(["up", "down", "sideways"].includes(result.direction));
  assert.ok(Number.isFinite(result.projectedPrice) && result.projectedPrice > 0);
  assert.ok(result.confidenceScore >= 20 && result.confidenceScore <= 70);
  assert.equal(result.horizonCandles, 3);
});

test("forecast rejects insufficient candles", () => {
  assert.throws(() => buildForecast(candles(10)), /At least 30/);
});

test("forecast rejects invalid values", () => {
  const rows = candles();
  rows[50].close = Number.NaN;
  assert.throws(() => buildForecast(rows), /Invalid candle/);
});

test("horizon is safely bounded by endpoint and engine remains finite", () => {
  const result = buildForecast(candles(), 12);
  assert.ok(Number.isFinite(result.projectedChangePct));
});
