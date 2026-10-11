import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/api/exchanges/market/route.ts", import.meta.url), "utf8");
const consolePage = readFileSync(new URL("../public/console.html", import.meta.url), "utf8");
const agentPage = readFileSync(new URL("../public/agents.html", import.meta.url), "utf8");
const chatRoute = readFileSync(new URL("../app/api/chat/route.ts", import.meta.url), "utf8");
const visionRoute = readFileSync(new URL("../app/api/vision/route.ts", import.meta.url), "utf8");
const documentsRoute = readFileSync(new URL("../app/api/documents/route.ts", import.meta.url), "utf8");
const storeModule = readFileSync(new URL("../lib/store.ts", import.meta.url), "utf8");

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

test("Trading Agent and Trading Team attach fetched market context", () => {
  assert.match(consolePage, /if\(currentMode==='trading'\)/);
  assert.match(consolePage, /await enrichTradingHandoff\(marketParams\)/);
  assert.match(consolePage, /VERIFIED MARKET DATA CONTEXT/);
  assert.match(agentPage, /profile==='trading'/);
  assert.match(agentPage, /TRADING MARKET DATA CONTEXT/);
  assert.match(agentPage, /TEAM COMMUNICATION SO FAR/);
});

test("all named single-agent modes have explicit behavior", () => {
  for (const mode of ["research", "code", "work", "trading"]) {
    assert.ok(consolePage.includes("if(mode==='"+mode+"')"), "missing mode handler: "+mode);
  }
  assert.match(consolePage, /async function send\(\)/);
  assert.match(consolePage, /await fetch\('\/api\/chat'/);
});

test("chat endpoint fails closed without private access configuration", () => {
  assert.match(chatRoute, /if \(!accessCodeConfigured\)/);
  assert.match(chatRoute, /status: 503/);
  assert.match(chatRoute, /if \(!isAuthorized\(request\)\)/);
  assert.match(chatRoute, /status: 401/);
  assert.ok(chatRoute.indexOf("if (!accessCodeConfigured)") < chatRoute.indexOf("if (!isAuthorized(request))"));
});

test("image analysis uses the signed private session and fails closed", () => {
  assert.match(visionRoute, /import \{ isAuthorized \} from "\.\.\/\.\.\/\.\.\/lib\/auth"/);
  assert.match(visionRoute, /if \(!process\.env\.TAROTAI_ACCESS_CODE\)/);
  assert.match(visionRoute, /if \(!isAuthorized\(request\)\)/);
  assert.doesNotMatch(visionRoute, /tarotai_session=authorized/);
  assert.doesNotMatch(visionRoute, /return !configured \|\| Boolean\(session\)/);
});

test("document extraction uses the signed private session and fails closed", () => {
  assert.match(documentsRoute, /import \{ isAuthorized \} from "\.\.\/\.\.\/\.\.\/lib\/auth"/);
  assert.match(documentsRoute, /if \(!process\.env\.TAROTAI_ACCESS_CODE\)/);
  assert.match(documentsRoute, /if \(!isAuthorized\(request\)\)/);
  assert.doesNotMatch(documentsRoute, /tarotai_session=authorized/);
  assert.doesNotMatch(documentsRoute, /return !configured \|\| Boolean\(session\)/);
});

test("uploads stay below the hosting platform request-body limit", () => {
  assert.match(documentsRoute, /const MAX_BYTES = 4 \* 1024 \* 1024/);
  assert.match(documentsRoute, /Maximum upload size is 4 MB/);
  assert.match(visionRoute, /item\.size > 4 \* 1024 \* 1024/);
  assert.match(consolePage, /file\.size>4\*1024\*1024/);
});

test("shared state, memory, apps and audit routes fail closed without access secret", () => {
  assert.match(storeModule, /export function authorized\(request: Request\)/);
  assert.match(storeModule, /if \(!process\.env\.TAROTAI_ACCESS_CODE\) return false/);
  assert.match(storeModule, /return isAuthorized\(request\)/);
  assert.doesNotMatch(storeModule, /return !process\.env\.TAROTAI_ACCESS_CODE \|\| isAuthorized/);
});
