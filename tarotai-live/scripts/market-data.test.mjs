import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/api/exchanges/market/route.ts", import.meta.url), "utf8");

test("market feeds use production public endpoints, never demo or testnet prices", () => {
  assert.match(source, /https:\/\/fapi\.binance\.com\/fapi\/v1\/klines/);
  assert.match(source, /https:\/\/api\.bybit\.com\/v5\/market\/kline/);
  assert.match(source, /https:\/\/www\.okx\.com\/api\/v5\/market\/candles/);
  assert.doesNotMatch(source, /demo-fapi\.binance\.com|api-testnet\.bybit\.com/);
});

test("market API is private-session protected and cannot submit exchange orders", () => {
  assert.match(source, /if\(!isAuthorized\(req\)\)/);
  assert.match(source, /marketDataMode:"live-public-read-only"/);
  assert.match(source, /readOnly:true,orderPlacement:false/);
  assert.match(source, /if\(!process\.env\.TAROTAI_ACCESS_CODE\)/);
});

test("market API validates candle contents and reports stale data", () => {
  assert.match(source, /candles\.some\(c=>!\[c\.time,c\.open,c\.high,c\.low,c\.close\]\.every\(Number\.isFinite\)/);
  assert.match(source, /const stale=ageMs>intervalMs\[interval\]\+60000/);
  assert.match(source, /Cache-Control":"no-store"/);
});
