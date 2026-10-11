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
const authModule = readFileSync(new URL("../lib/auth.ts", import.meta.url), "utf8");
const authRoute = readFileSync(new URL("../app/api/auth/route.ts", import.meta.url), "utf8");
const stateRoute = readFileSync(new URL("../app/api/state/route.ts", import.meta.url), "utf8");
const healthRoute = readFileSync(new URL("../app/api/health/route.ts", import.meta.url), "utf8");

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
  assert.match(consolePage, /params\.get\('auto'\)==='1'&&handoffTask/);
  assert.doesNotMatch(consolePage, /params\.get\('mode'\)==='trading'&&params\.get\('symbol'\)\)await enrichTradingHandoff\(params\)/);
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

test("OpenRouter request deadline stays active until response body is consumed", () => {
  const bodyRead = chatRoute.indexOf("raw = await upstream.text();");
  const timerClear = chatRoute.indexOf("clearTimeout(timeout);", bodyRead);
  assert.ok(bodyRead >= 0, "OpenRouter response body is explicitly read");
  assert.ok(timerClear > bodyRead, "deadline cleanup follows the body read");
  assert.match(chatRoute, /const requestDeadline = Date\.now\(\) \+ 105_000/);
  assert.match(chatRoute, /Math\.min\(30_000, remainingMs\)/);
  assert.match(chatRoute, /status: timedOut \? 504 : 500/);
});

test("durable owner identity comes from the verified signed session", () => {
  assert.match(authModule, /export function sessionUserId\(request: Request\)/);
  assert.match(authModule, /function readSession\(request: Request\)/);
  assert.match(authModule, /timingSafeEqual\(actualBytes, expectedBytes\)/);
  assert.match(storeModule, /return sessionUserId\(request\)/);
  assert.doesNotMatch(storeModule, /tarotai_user=/);
  assert.match(authRoute, /sub:"owner"/);
  assert.match(chatRoute, /async function getComposioRuntime\(request: Request\)/);
  assert.match(chatRoute, /const userId = privateUserId\(request\)/);
  assert.doesNotMatch(chatRoute, /cookieValue\(request, "tarotai_user"\)/);
});

test("durable state writes are queued with snapshots and an abort deadline", () => {
  assert.match(consolePage, /let stateWriteQueue=Promise\.resolve\(\)/);
  assert.match(consolePage, /const messages=state\.messages\.slice\(-40\)\.map\(m=>\(\{/);
  assert.match(consolePage, /const tasks=state\.tasks\.slice\(0,80\)\.map\(t=>\(\{/);
  assert.match(consolePage, /const body=JSON\.stringify\(\{messages,tasks\}\)/);
  assert.match(consolePage, /stateWriteQueue=stateWriteQueue\.catch\(\(\)=>null\)\.then\(\(\)=>fetch\('\/api\/state'/);
  assert.match(consolePage, /signal:AbortSignal\.timeout\(8000\)/);
  assert.match(consolePage, /if\(!state\.auth\)return Promise\.resolve\(null\)/);
});

test("chat payload is byte-capped and sends bounded recent context", () => {
  assert.match(chatRoute, /const maxRequestBytes = 1_200_000/);
  assert.match(chatRoute, /Buffer\.byteLength\(rawBody, "utf8"\)/);
  assert.match(chatRoute, /Malformed JSON request body/);
  assert.match(consolePage, /state\.messages\.slice\(-24\)/);
  assert.match(consolePage, /String\(m\.content\?\?''\)\.slice\(-4000\)/);
  assert.match(consolePage, /text\.length>12000/);
  assert.match(consolePage, /Math\.min\(60000,remaining\)/);
  assert.match(consolePage, /documentCharacters\+=clipped\.length/);
});

test("durable-state persistence uses bounded snapshots and validates request bytes", () => {
  assert.match(consolePage, /state\.messages\.slice\(-40\)/);
  assert.match(consolePage, /content:String\(m\.content\?\?''\)\.slice\(0,8000\)/);
  assert.match(consolePage, /state\.tasks\.slice\(0,80\)/);
  assert.match(stateRoute, /const maxRequestBytes = 2_400_000/);
  assert.match(stateRoute, /Buffer\.byteLength\(rawBody, "utf8"\)/);
  assert.match(stateRoute, /Malformed state request body/);
});

test("Multi-Agent Workspace bounds requests and distinguishes partial failure from success", () => {
  assert.match(agentPage, /signal:AbortSignal\.timeout\(110000\)/);
  assert.match(agentPage, /failed=true;run\.outputs\.push/);
  assert.match(agentPage, /Run paused after an error\. Partial results are saved in this browser\./);
  assert.match(agentPage, /Run finished successfully\. Results are saved in this browser\./);
});

test("Multi-Agent Workspace bounds in-memory run history as well as stored history", () => {
  assert.match(agentPage, /function persist\(\)\{if\(history\.length>30\)history=history\.slice\(0,30\)/);
  assert.match(agentPage, /writeStoredJson\('tarotai_agent_runs_v1',history\)/);
});

test("console and agent workspace recover when browser storage is corrupt", () => {
  assert.match(consolePage, /function readStoredJson\(key,fallback\)/);
  assert.match(consolePage, /if\(!Array\.isArray\(state\.messages\)\)state\.messages=\[\]/);
  assert.match(consolePage, /if\(!Array\.isArray\(state\.tasks\)\)state\.tasks=\[\]/);
  assert.match(agentPage, /let agents=readStoredJson\('tarotai_agents_v1',null\)/);
  assert.match(agentPage, /agents=agents\.filter\(a=>a&&typeof a\.id==='string'/);
  assert.match(agentPage, /let history=readStoredJson\('tarotai_agent_runs_v1',\[\]\)/);
  assert.match(agentPage, /if\(!Array\.isArray\(history\)\)history=\[\]/);
  assert.match(consolePage, /function writeStoredJson\(key,value\)/);
  assert.match(consolePage, /catch\{return false\}/);
  assert.match(agentPage, /function writeStoredJson\(key,value\)/);
});

test("public health checks do not disclose private environment capabilities", () => {
  assert.match(healthRoute, /import \{ isAuthorized \} from "@\/lib\/auth"/);
  assert.match(healthRoute, /if \(!isAuthorized\(request\)\)/);
  assert.match(healthRoute, /return Response\.json\(base/);
  assert.ok(healthRoute.indexOf("if (!isAuthorized(request))") < healthRoute.indexOf("hasOpenRouterKey:"));
  assert.ok(healthRoute.indexOf("if (!isAuthorized(request))") < healthRoute.indexOf("hasExa:"));
});

test("external tool fetches and tool dispatch have bounded deadlines", () => {
  assert.match(chatRoute, /async function boundedFetch\(input: any, init: RequestInit = \{\}, timeoutMs = 15_000\)/);
  assert.match(chatRoute, /init\.signal \?\? AbortSignal\.timeout\(timeoutMs\)/);
  assert.match(chatRoute, /const remainingToolMs = requestDeadline - Date\.now\(\)/);
  assert.match(chatRoute, /Math\.min\(32_000, remainingToolMs\)/);
  assert.match(chatRoute, /Tool execution timed out or exceeded the remaining task deadline/);
  assert.equal((chatRoute.match(/\bfetch\(/g) || []).length, 1, "only the timeout wrapper calls native fetch directly");
  assert.ok((chatRoute.match(/\bboundedFetch\(/g) || []).length >= 10, "external tool requests use the timeout wrapper");
});

test("Composio bootstrap is bounded and optional integrations do not block core chat", () => {
  assert.match(chatRoute, /const requestDeadline = Date\.now\(\) \+ 105_000/);
  assert.match(chatRoute, /composioBudgetMs = Math\.max\(1, Math\.min\(12_000, requestDeadline - Date\.now\(\)\)\)/);
  assert.match(chatRoute, /Connected-app setup exceeded its 12-second startup budget/);
  assert.match(chatRoute, /continuing with core TarotAI tools/);
  assert.match(chatRoute, /Connected-app tools failed to initialize for this request/);
  assert.ok(chatRoute.indexOf("const requestDeadline = Date.now() + 105_000") < chatRoute.indexOf("getComposioRuntime(request)"));
  assert.ok(chatRoute.indexOf("const requestDeadline = Date.now() + 105_000") < chatRoute.indexOf("for (let turn = 0; turn < 4; turn += 1)"));
});
