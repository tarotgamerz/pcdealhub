import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDepthSnapshot, summarizeOrderBook } from "../lib/orderbook.mjs";

const payload = {
  lastUpdateId: 12345,
  E: 1_800_000_000_000,
  T: 1_800_000_000_000,
  bids: [["100", "2"], ["101", "1"], ["99", "3"]],
  asks: [["103", "1"], ["102", "2"], ["104", "0"]]
};

test("normalizes order levels and sorts best prices first", () => {
  const snapshot = normalizeDepthSnapshot("BTCUSDT", payload);
  assert.deepEqual(snapshot.bids.map(([p]) => p), [101, 100, 99]);
  assert.deepEqual(snapshot.asks.map(([p]) => p), [102, 103]);
  assert.equal(snapshot.lastUpdateId, 12345);
});

test("calculates spread and bounded quote-depth imbalance", () => {
  const snapshot = normalizeDepthSnapshot("BTCUSDT", payload);
  const metrics = summarizeOrderBook(snapshot, 1_800_000_000_500);
  assert.equal(metrics.bestBid, 101);
  assert.equal(metrics.bestAsk, 102);
  assert.ok(metrics.spreadBps > 0);
  assert.equal(metrics.snapshotAgeMs, 500);
  assert.ok(metrics.depthImbalancePct >= -100 && metrics.depthImbalancePct <= 100);
  assert.equal(metrics.bidLevels[0].quoteNotional, 101);
});

test("rejects crossed and malformed snapshots", () => {
  assert.throws(() => normalizeDepthSnapshot("BTCUSDT", {
    lastUpdateId: 1, bids: [["102", "1"]], asks: [["101", "1"]]
  }), /crossed/);
  assert.throws(() => normalizeDepthSnapshot("BTCUSDT", {
    lastUpdateId: 1, bids: [["not-a-price", "1"]], asks: [["101", "1"]]
  }), /invalid price/);
  assert.throws(() => normalizeDepthSnapshot("BTCUSDT", {
    lastUpdateId: -1, bids: [["100", "1"]], asks: [["101", "1"]]
  }), /update ID/);
});
