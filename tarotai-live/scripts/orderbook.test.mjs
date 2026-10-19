import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDepthSnapshot, summarizeOrderBook } from "../lib/orderbook.mjs";
import { readFileSync } from "node:fs";

const orderflowPanelSource = readFileSync(new URL("../public/orderflow-panel.js", import.meta.url), "utf8");
const orderbookRouteSource = readFileSync(new URL("../app/api/trading/orderbook/route.ts", import.meta.url), "utf8");

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

test("labels local REST receipt freshness when the exchange provides no event timestamp", () => {
  const receivedAt = 1_800_000_000_000;
  const snapshot = normalizeDepthSnapshot("BTCUSDT", {
    lastUpdateId: 9, receivedAt,
    bids: [["100", "2"]], asks: [["101", "2"]]
  });
  const metrics = summarizeOrderBook(snapshot, receivedAt + 25);
  assert.equal(metrics.snapshotAgeMs, 25);
  assert.equal(metrics.timestampSource, "local-receipt-time");
  assert.equal(metrics.exchangeEventTime, null);
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

test("routes Binance Futures depth and aggregate trades to their documented stream categories", () => {
  assert.match(
    orderflowPanelSource,
    /new WebSocket\("wss:\/\/fstream\.binance\.com\/public\/stream\?streams=" \+ activeSymbol\.toLowerCase\(\) \+ "@depth@100ms"\)/
  );
  assert.match(
    orderflowPanelSource,
    /new WebSocket\("wss:\/\/fstream\.binance\.com\/market\/stream\?streams=" \+ symbol\.toLowerCase\(\) \+ "@aggTrade"\)/
  );
  assert.doesNotMatch(
    orderflowPanelSource,
    /new WebSocket\("wss:\/\/fstream\.binance\.com\/public\/stream\?streams=" \+ symbol\.toLowerCase\(\) \+ "@aggTrade"\)/
  );
});


test("public read-only depth snapshot is available without the private AI session", () => {
  assert.doesNotMatch(orderbookRouteSource, /isAuthorized|TAROTAI_ACCESS_CODE/);
  assert.match(orderbookRouteSource, /fapi\.binance\.com\/fapi\/v1\/depth/);
  assert.match(orderbookRouteSource, /liveOrdersEnabled: false/);
  assert.match(orderbookRouteSource, /readOnly: true/);
});

test("initial local order book bridges the REST snapshot at lastUpdateId plus one", () => {
  assert.match(orderflowPanelSource, /const firstRequiredUpdateId = book\.lastUpdateId \+ 1/);
  assert.match(orderflowPanelSource, /Number\(first\.U\) <= firstRequiredUpdateId && Number\(first\.u\) >= firstRequiredUpdateId/);
});
