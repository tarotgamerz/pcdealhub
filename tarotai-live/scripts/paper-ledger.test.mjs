import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PAPER_LEDGER_PERSIST_LUA, persistPaperTrade, readPaperRequestRecord } from "../lib/paper-ledger.mjs";

const route = readFileSync(new URL("../app/api/trading/paper/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../public/trading-desk.html", import.meta.url), "utf8");

function fakeRedis(result) {
  return { calls: [], async eval(script, keys, args) { this.calls.push({ script, keys, args }); return result; } };
}

test("paper trade writes use one atomic Redis script for ledger and open index", () => {
  assert.match(PAPER_LEDGER_PERSIST_LUA, /redis\.call\('LPUSH', ledgerKey, tradeJson\)/);
  assert.match(PAPER_LEDGER_PERSIST_LUA, /redis\.call\('HSET', openKey, tradeId, tradeJson\)/);
  assert.match(PAPER_LEDGER_PERSIST_LUA, /redis\.call\('HDEL', openKey, parentId\)/);
  assert.match(PAPER_LEDGER_PERSIST_LUA, /redis\.call\('HDEL', cursorKey, parentId\)/);
  assert.match(PAPER_LEDGER_PERSIST_LUA, /redis\.call\('LTRIM', ledgerKey, 0, retention - 1\)/);
  assert.match(PAPER_LEDGER_PERSIST_LUA, /redis\.call\('SET', requestKey, requestRecord, 'EX', 7776000\)/);
  assert.match(PAPER_LEDGER_PERSIST_LUA, /CLOSE_STATUS_INVALID/);
  assert.match(PAPER_LEDGER_PERSIST_LUA, /OPEN_POSITION_INDEX_MISMATCH/);
  assert.ok(PAPER_LEDGER_PERSIST_LUA.indexOf("redis.call('HGET', openKey, parentId)") < PAPER_LEDGER_PERSIST_LUA.indexOf("redis.call('LPUSH', ledgerKey, tradeJson)"), "close validates open index before writes");
  assert.ok(PAPER_LEDGER_PERSIST_LUA.indexOf("redis.call('GET', requestKey)") < PAPER_LEDGER_PERSIST_LUA.indexOf("redis.call('LPUSH', ledgerKey, tradeJson)"), "duplicate requests are checked before writes");
  assert.match(route, /persistPaperTrade\(d,/);
  assert.doesNotMatch(route, /await d\.lpush\("tarotai:paper:ledger",JSON\.stringify\(trade\)\)/);
});

test("OPEN transaction passes stable request ID, correct Redis keys, and persisted trade", async () => {
  const trade = { id: "trade-1", status: "PAPER_OPEN", symbol: "BTCUSDT" };
  const saved = { action: "OPEN", trade: { ...trade, requestId: "open_12345678901234567890" } };
  const redis = fakeRedis([1, JSON.stringify(saved)]);
  const result = await persistPaperTrade(redis, { requestId: "open_12345678901234567890", action: "OPEN", trade });
  assert.equal(redis.calls.length, 1);
  assert.equal(redis.calls[0].keys[1], "tarotai:paper:ledger");
  assert.equal(redis.calls[0].keys[2], "tarotai:paper:open_positions");
  assert.equal(redis.calls[0].args[1], "OPEN");
  assert.equal(JSON.parse(redis.calls[0].args[2]).requestId, "open_12345678901234567890");
  assert.deepEqual(result, { ok: true, duplicate: false, action: "OPEN", trade: saved.trade });
});

test("repeated identical requests return the original committed trade", async () => {
  const trade = { id: "trade-1", status: "PAPER_OPEN", requestId: "open_12345678901234567890" };
  const redis = fakeRedis([0, JSON.stringify({ action: "OPEN", trade })]);
  const result = await persistPaperTrade(redis, { requestId: trade.requestId, action: "OPEN", trade });
  assert.equal(result.ok, true);
  assert.equal(result.duplicate, true);
  assert.equal(result.trade.id, "trade-1");
});

test("mismatched request action and missing close parent fail without reporting a commit", async () => {
  const redisConflict = fakeRedis([-2, JSON.stringify({ action: "OPEN", trade: { id: "trade-1" } })]);
  const conflict = await persistPaperTrade(redisConflict, { requestId: "open_12345678901234567890", action: "CLOSE", trade: { id: "close-1", parentTradeId: "trade-1" }, parentTradeId: "trade-1" });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.reason, "idempotency-conflict");
  const redisMissing = fakeRedis([-1, "OPEN_POSITION_INDEX_MISSING"]);
  const missing = await persistPaperTrade(redisMissing, { requestId: "close_12345678901234567890", action: "CLOSE", trade: { id: "close-1", parentTradeId: "trade-1" }, parentTradeId: "trade-1" });
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, "OPEN_POSITION_INDEX_MISSING");
});

test("stored request record parsing rejects malformed cache and preserves trade identity", () => {
  assert.equal(readPaperRequestRecord(null), null);
  assert.equal(readPaperRequestRecord(JSON.stringify({ action: "CLOSE", trade: { id: "close-1" } })).trade.id, "close-1");
  assert.throws(() => readPaperRequestRecord("{broken"), /JSON/);
  assert.throws(() => readPaperRequestRecord(JSON.stringify({ action: "DELETE", trade: {} })), /malformed/);
});

test("all visible paper OPEN and CLOSE UI actions include idempotency identifiers", () => {
  assert.match(page, /action:'OPEN',requestId:/);
  assert.match(page, /action:'CLOSE',requestId:'close_'\+trade\.id/);
  assert.match(page, /action:"OPEN",requestId:requestId/);
  assert.match(page, /action:"CLOSE",requestId:"close_"\+t\.id/);
  assert.match(page, /tarotaiPaperRequestIdFor/);
});

test("paper risk controls reject out-of-range values and explain percent units", () => {
  assert.match(page, /id="livePaperRisk" type="number" min="0\.1" max="1" step="0\.1" inputmode="decimal" value="0\.5" aria-describedby="livePaperRiskHelp"/);
  assert.match(page, /function validatePaperRiskInput\(options=\{\}\)/);
  assert.match(page, /A value of 25 means 25%, not 0\.25%/);
  assert.match(page, /async function paperOpenSignal\(\)\{\s*const validatedRiskPct=validatePaperRiskInput\(\{showStatus:true\}\);\s*if\(validatedRiskPct===null\)return;/);
  assert.match(page, /async function paperOpenObservation\(\)\{\s*const validatedRiskPct=validatePaperRiskInput\(\{showStatus:true\}\);\s*if\(validatedRiskPct===null\)return;/);
  assert.match(page, /validatePaperRiskInput\(\{repair:true\}\)/);
  assert.match(route, /Risk per trade must be between 0\.1% and 1\.0% of simulated balance/);
});

 
test("paper desk preserves a 100,000 USDT capital setting and shows account-level balances",()=> {
  assert.match(page, /id="livePaperBalance" type="number" min="100" max="10000000" step="100" value="100000" aria-describedby="livePaperBalanceHelp"/);
  assert.match(page, /tarotaiPaperBalance/);
  assert.match(page, /id="livePaperAccountNotional"/);
  assert.match(page, /id="livePaperAccountAvailable"/);
  assert.match(page, /PAPER_UI_MAX_POSITION_EXPOSURE_PCT=25,PAPER_UI_MAX_PORTFOLIO_EXPOSURE_PCT=100,PAPER_UI_MAX_OPEN_RISK_PCT=3,PAPER_UI_MAX_OPEN_POSITIONS=10,PAPER_UI_MAX_POSITIONS_PER_SYMBOL=5/);
});

test("paper desk and server allow bounded same-direction scale-in tickets",()=> {
  assert.match(page, /same-direction scale-ins are supported up to/);
  assert.match(page, /same-direction positions per market reached/);
  assert.match(page, /PAPER_UI_MAX_OPEN_POSITIONS=10/);
  assert.match(route, /same-direction scale-in positions are supported/);
  assert.match(route, /PAPER_MAX_OPEN_POSITIONS/);
  assert.match(route, /PAPER_MAX_POSITIONS_PER_SYMBOL/);
  assert.match(route, /existingOpenRisk/);
  assert.doesNotMatch(route, /if\(openRows\.some\(\(x:any\)=>x\.symbol===symbol\)\)/);
});
