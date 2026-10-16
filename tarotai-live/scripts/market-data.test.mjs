import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findSimilarCases } from "../lib/market-patterns.mjs";

const source = readFileSync(new URL("../app/api/exchanges/market/route.ts", import.meta.url), "utf8");
const consolePage = readFileSync(new URL("../public/console.html", import.meta.url), "utf8");
const agentPage = readFileSync(new URL("../public/agents.html", import.meta.url), "utf8");
const chatRoute = readFileSync(new URL("../app/api/chat/route.ts", import.meta.url), "utf8");
const tradingRoomPage = readFileSync(new URL("../public/trading-strategy-room.html", import.meta.url), "utf8");
const auditScript = readFileSync(new URL("./audit-dependencies.mjs", import.meta.url), "utf8");
const visionRoute = readFileSync(new URL("../app/api/vision/route.ts", import.meta.url), "utf8");
const documentsRoute = readFileSync(new URL("../app/api/documents/route.ts", import.meta.url), "utf8");
const storeModule = readFileSync(new URL("../lib/store.ts", import.meta.url), "utf8");
const authModule = readFileSync(new URL("../lib/auth.ts", import.meta.url), "utf8");
const authRoute = readFileSync(new URL("../app/api/auth/route.ts", import.meta.url), "utf8");
const stateRoute = readFileSync(new URL("../app/api/state/route.ts", import.meta.url), "utf8");
const healthRoute = readFileSync(new URL("../app/api/health/route.ts", import.meta.url), "utf8");
const tradingMarketRoute = readFileSync(new URL("../app/api/trading/market/route.ts", import.meta.url), "utf8");
const liveQuoteRoute = readFileSync(new URL("../app/api/exchanges/quote/route.ts", import.meta.url), "utf8");
const documentExtract = readFileSync(new URL("../lib/document-extract.mjs", import.meta.url), "utf8");
const tradingViewRoute = readFileSync(new URL("../app/api/tradingview/route.ts", import.meta.url), "utf8");
const binanceOrderRoute = readFileSync(new URL("../app/api/trading/testnet-order/route.ts", import.meta.url), "utf8");
const binanceOrderStatusRoute = readFileSync(new URL("../app/api/trading/testnet-order-status/route.ts", import.meta.url), "utf8");
const bybitOrderRoute = readFileSync(new URL("../app/api/trading/bybit-testnet-order/route.ts", import.meta.url), "utf8");
const bybitOrderStatusRoute = readFileSync(new URL("../app/api/trading/bybit-testnet-order-status/route.ts", import.meta.url), "utf8");
const okxOrderRoute = readFileSync(new URL("../app/api/trading/okx-demo-order/route.ts", import.meta.url), "utf8");
const okxOrderStatusRoute = readFileSync(new URL("../app/api/trading/okx-demo-order-status/route.ts", import.meta.url), "utf8");
const backtestRoute = readFileSync(new URL("../app/api/trading/backtest/route.ts", import.meta.url), "utf8");
const paperRoute = readFileSync(new URL("../app/api/trading/paper/route.ts", import.meta.url), "utf8");
const reviewRoute = readFileSync(new URL("../app/api/trading/review/route.ts", import.meta.url), "utf8");
const tradingViewSignalsRoute = readFileSync(new URL("../app/api/tradingview/signals/route.ts", import.meta.url), "utf8");

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

test("market API validates candle contents and computes freshness from closed candle time", () => {
  assert.match(source, /candles\.some\(c=>!\[c\.time,c\.open,c\.high,c\.low,c\.close\]\.every\(Number\.isFinite\)/);
  assert.match(source, /const candleEnd=\(c:any\)=>Number\.isFinite\(c\.closeTime\)/);
  assert.match(source, /const closedCandles=candles\.filter\(c=>candleEnd\(c\)<now-300\)/);
  assert.match(source, /const ageMs=latestClosed\?Math\.max\(0,now-candleEnd\(latestClosed\)\)/);
  assert.match(source, /latestClosedCandleTime:latestClosed\?\.time\?\?null/);
  assert.match(source, /stale=!Number\.isFinite\(ageMs\)\|\|ageMs>duration\+60000/);
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


test("Trading Strategy Room enforces trading-only scope and disables tools server-side", () => {
  assert.match(tradingRoomPage, /mode:"trading-room",tradingRoomTopic:topic/);
  assert.match(chatRoute, /"trading-room"\]/);
  assert.match(chatRoute, /tradingRoomTopicPattern\.test\(tradingRoomTopic\)/);
  const matcher = chatRoute.match(/const tradingRoomTopicPattern = (\/.*\/i);/);
  assert.ok(matcher, "server must declare the room topic matcher");
  const topicMatcher = new RegExp(matcher[1].slice(1, -2), "i");
  assert.match("Challenge the BTCUSDT 15m breakout strategy and stop loss", topicMatcher);
  assert.match("Analyze BTCUSDT on the 15m timeframe", topicMatcher);
  assert.doesNotMatch("Help me write a poem about spring", topicMatcher);
  assert.match(chatRoute, /Trading Strategy Room mode: strictly discuss trading only/);
  assert.match(chatRoute, /const runtimeTools: any\[\] = requestedMode === "trading-room"\s*\? \[\]/);
  assert.match(chatRoute, /process\.env\.COMPOSIO_API_KEY && requestedMode !== "trading-room"/);
  assert.match(chatRoute, /requestedMode !== "trading-room" && durableMemory\.length/);
  assert.match(chatRoute, /requestedMode !== "trading-room" && documents\.length/);
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
  assert.match(chatRoute, /Connected-app tools could not be initialized for this request/);
  assert.match(chatRoute, /Some TarotAI supporting services were degraded during this request/);
  assert.ok(chatRoute.indexOf("const requestDeadline = Date.now() + 105_000") < chatRoute.indexOf("getComposioRuntime(request)"));
  assert.ok(chatRoute.indexOf("const requestDeadline = Date.now() + 105_000") < chatRoute.indexOf("for (let turn = 0; turn < 4; turn += 1)"));
});

test("core chat degrades safely when Redis rate limiting or durable memory fails", () => {
  assert.match(chatRoute, /const localRateLimitBuckets = new Map/);
  assert.match(chatRoute, /function consumeLocalFallbackRateLimit\(userId: string, limit: number\)/);
  assert.match(chatRoute, /withOperationTimeout\(\s*consumeRateLimit\(userId, limit\)/);
  assert.match(chatRoute, /Shared Redis rate limiting was temporarily unavailable/);
  assert.match(chatRoute, /if \(!process\.env\.UPSTASH_REDIS_REST_URL \|\| !process\.env\.UPSTASH_REDIS_REST_TOKEN\)/);
  assert.match(chatRoute, /Shared Redis rate limiting is not configured/);
  assert.match(chatRoute, /withOperationTimeout\(\s*loadDurableMemory\(request\)/);
  assert.match(chatRoute, /Durable memory could not be loaded for this request/);
  assert.match(chatRoute, /runtimeWarnings\.join\(" "\)/);
});

test("Futures Lab market data is private and bounded to demo prices", () => {
  assert.match(tradingMarketRoute, /import \{ isAuthorized \} from "\.\.\/\.\.\/\.\.\/\.\.\/lib\/auth"/);
  assert.match(tradingMarketRoute, /if \(!process\.env\.TAROTAI_ACCESS_CODE\)/);
  assert.match(tradingMarketRoute, /if \(!isAuthorized\(request\)\)/);
  assert.match(tradingMarketRoute, /https:\/\/demo-fapi\.binance\.com/);
  assert.match(tradingMarketRoute, /AbortSignal\.timeout\(8000\)/);
  assert.doesNotMatch(tradingMarketRoute, /\/fapi\/v1\/order|\/order\/create/);
});

test("TradingView webhooks cap payloads and atomically deduplicate queued signals", () => {
  assert.match(tradingViewRoute, /const maxPayloadBytes = 16 \* 1024/);
  assert.match(tradingViewRoute, /Buffer\.byteLength\(rawBody, "utf8"\)/);
  assert.match(tradingViewRoute, /const result = await redis\.eval<number\[\]>\(/);
  assert.match(tradingViewRoute, /return \{0\} end/);
  assert.match(tradingViewRoute, /"return \{1\}"/);
  assert.match(tradingViewRoute, /Number\(result\?\.\[0\]\) !== 1/);
  assert.match(tradingViewRoute, /redis\.call\('EXISTS', KEYS\[1\]\)/);
  assert.match(tradingViewRoute, /redis\.call\('LPUSH', KEYS\[2\], ARGV\[1\]\)/);
  assert.match(tradingViewRoute, /redis\.call\('SET', KEYS\[1\], '1', 'EX', 86400\)/);
  assert.match(tradingViewRoute, /DUPLICATE_IGNORED/);
  assert.match(tradingViewRoute, /No order was placed/);
});

test("all private order, paper, backtest and signal endpoints fail closed", () => {
  const privateRoutes = [
    binanceOrderRoute, binanceOrderStatusRoute,
    bybitOrderRoute, bybitOrderStatusRoute,
    okxOrderRoute, okxOrderStatusRoute,
    backtestRoute, paperRoute, reviewRoute, tradingViewSignalsRoute
  ];
  for (const route of privateRoutes) {
    assert.match(route, /TAROTAI_ACCESS_CODE/);
    assert.match(route, /isAuthorized\(/);
  }
  assert.match(binanceOrderRoute, /confirmTestnetOrder!==true/);
  assert.match(bybitOrderRoute, /confirmTestnetOrder!==true/);
  assert.match(okxOrderRoute, /confirmTestnetOrder!==true/);
  assert.match(binanceOrderRoute, /demo-fapi\.binance\.com/);
  assert.match(binanceOrderStatusRoute, /demo-fapi\.binance\.com/);
  assert.match(bybitOrderRoute, /api-testnet\.bybit\.com/);
  assert.match(bybitOrderStatusRoute, /api-testnet\.bybit\.com/);
  assert.match(okxOrderRoute, /x-simulated-trading":"1"/);
  assert.match(okxOrderStatusRoute, /x-simulated-trading":"1"/);
  assert.match(tradingMarketRoute, /Number\.isFinite\(requestedLimit\)/);
  assert.match(tradingMarketRoute, /Math\.floor\(requestedLimit\)/);
  assert.doesNotMatch(binanceOrderRoute, /https:\/\/fapi\.binance\.com/);
  assert.doesNotMatch(bybitOrderRoute, /https:\/\/api\.bybit\.com/);
});

test("backend receives agent mode and enforces Research search and Work planning", () => {
  assert.match(consolePage, /mode:currentMode\|\|'chat'/);
  assert.match(chatRoute, /const requestedMode = \["chat", "research", "code", "work", "trading", "trading-room"\]/);
  assert.match(chatRoute, /turn === 0 && \["research", "work"\]\.includes\(requestedMode\) && availableToolNames\.has\("set_plan"\)/);
  assert.match(chatRoute, /turn === 1 && requestedMode === "research" && availableToolNames\.has\("search_web"\)/);
  assert.match(chatRoute, /type: "function", function: \{ name: "search_web" \}/);
  assert.match(chatRoute, /type: "function", function: \{ name: "set_plan" \}/);
  assert.match(chatRoute, /Research Agent mode: verify factual claims through real search results/);
  assert.match(chatRoute, /Code Agent mode: inspect relevant source and documentation/);
  assert.match(chatRoute, /Work Agent mode: plan, execute, observe results, adapt, and verify/);
  assert.match(chatRoute, /Trading Agent mode: analyze only using verified, timestamped market data/);
  assert.match(chatRoute, /Research mode has no live web-search tool available/);
});

test("demo candle API rejects malformed OHLCV records before returning them", () => {
  assert.match(tradingMarketRoute, /\.filter\(\(k: unknown\) => Array\.isArray\(k\) && k\.length >= 9\)/);
  assert.match(tradingMarketRoute, /\.every\(Number\.isFinite\)/);
  assert.match(tradingMarketRoute, /c\.high >= Math\.max\(c\.open,c\.close,c\.low\)/);
  assert.match(tradingMarketRoute, /candles\.length < 10/);
  assert.match(tradingMarketRoute, /insufficient valid candles for reliable analysis/);
});

test("TradingView keeps absent or blank signal prices unknown, not zero", () => {
  assert.match(tradingViewRoute, /body\.price !== undefined && body\.price !== null && String\(body\.price\)\.trim\(\) !== ""/);
  assert.match(tradingViewRoute, /Number\.isFinite\(Number\(body\.price\)\) \? Number\(body\.price\) : null/);
});

test("dependency audit fails closed when unavailable or when vulnerabilities are found", () => {
  assert.match(auditScript, /refusing to treat an unknown audit result as safe/);
  assert.match(auditScript, /process\.exit\(1\)/);
  assert.match(auditScript, /DEPENDENCY AUDIT FAILED/);
  assert.match(auditScript, /process\.exitCode = 1/);
});


const backtestEngine = readFileSync(new URL("../lib/trading-backtest.mjs", import.meta.url), "utf8");
const liveAgentBacktestEngine = readFileSync(new URL("../lib/live-agent-backtest.mjs", import.meta.url), "utf8");
const futuresDesk = readFileSync(new URL("../public/trading-desk.html", import.meta.url), "utf8");

test("historical backtest uses closed production candles and next-bar execution", () => {
  assert.match(backtestRoute, /fapi\.binance\.com/);
  assert.doesNotMatch(backtestRoute, /demo-fapi\.binance\.com/);
  assert.match(backtestRoute, /c\.closeTime < Date\.now\(\)/);
  assert.match(backtestRoute, /runSmaCrossoverBacktest/);
  assert.match(backtestRoute, /startIndex: split/);
  assert.match(backtestRoute, /fundingCostsIncluded: false/);
  assert.match(backtestEngine, /const fillCandle = candles\[i \+ 1\]/);
  assert.match(backtestEngine, /at candle i\+1's open/);
});

test("research backtest measures the actual live-agent rules with aligned higher-timeframe history",()=>{
  assert.match(futuresDesk, /function renderBacktestSummary\(report,httpStatus\)/);
  assert.match(futuresDesk, /id="backtestSummary"/);
  assert.match(futuresDesk, /Show raw backtest response/);
  assert.ok(futuresDesk.includes("Requested '+requested+' → data source '+actual"));
  assert.ok(futuresDesk.includes("String(report.source||'source not reported')"));
  assert.match(futuresDesk, /Fee \(bps\/side\)/);
  assert.match(futuresDesk, /Slippage \(bps\/side\)/);
  assert.match(futuresDesk, /liveAgentRiskPct:Number\(\$\('livePaperRisk'\)\.value\)/);
  assert.match(backtestRoute, /import \{ runLiveAgentStrategyBacktest, runWalkForwardStrategyComparison \}/);
  assert.match(backtestRoute, /const HIGHER_INTERVAL/);
  assert.match(backtestRoute, /fetchHistory\(resolvedVenue, symbol, higherInterval/);
  assert.match(backtestRoute, /fullSample: runLiveAgentStrategyBacktest/);
  assert.match(backtestRoute, /holdout: runLiveAgentStrategyBacktest/);
  assert.match(backtestRoute, /Only higher-timeframe candles whose closeTime is at or before each main signal candle close are considered/);
  assert.match(backtestRoute, /RESEARCH_ONLY_NO_ORDERS/);
  assert.match(liveAgentBacktestEngine, /const upBreak = last\.close > priorHigh, downBreak = last\.close < priorLow/);
  assert.match(liveAgentBacktestEngine, /rv >= 52 && rv <= 70/);
  assert.match(liveAgentBacktestEngine, /rv >= 30 && rv <= 48/);
  assert.match(liveAgentBacktestEngine, /end - from < 2/);
  assert.match(liveAgentBacktestEngine, /drift > maxDriftPct \/ 100/);
  assert.match(liveAgentBacktestEngine, /STOP_AMBIGUOUS/);
  assert.match(liveAgentBacktestEngine, /Fewer than 100 closed trades/);
  assert.match(liveAgentBacktestEngine, /higher timeframe uses only candles closed by then/);
});

test("live chart requires matching higher-timeframe trend for a current setup", () => {
  assert.match(futuresDesk, /higherCandles/);
  assert.match(futuresDesk, /higherTrendUp&&longScore>=4/);
  assert.match(futuresDesk, /higherTrendDown&&shortScore>=4/);
  assert.match(futuresDesk, /higher-timeframe trend/);
});


test("backtest transparently falls back across public exchanges when hosting restrictions block one feed", () => {
  assert.match(backtestRoute, /const venueOrder = \[venue, \.\.\.Object\.keys\(INTERVALS\)/);
  assert.match(backtestRoute, /resolvedVenue = candidateVenue/);
  assert.match(backtestRoute, /requestedVenue: venue, venue: resolvedVenue/);
  assert.match(backtestRoute, /feedErrors\.push/);
});


test("backtest can collect a bounded multi-page OKX candle sample", () => {
  assert.ok(backtestRoute.includes("/api/v5/market/candles"));
  assert.ok(backtestRoute.includes("const maxPages = Math.ceil(target / 300)"));
  assert.ok(backtestRoute.includes('endpoint.searchParams.set("after", after)'));
  assert.ok(backtestRoute.includes("requestedLimit > 1000"));
  assert.ok(futuresDesk.includes("limit:1000"));
});


test("live chart offers eight trade-lifecycle agents including a supervisor", () => {
  assert.match(futuresDesk, /id="toggleLiveAgentTeam"/);
  assert.match(futuresDesk, /id="liveAgentPanel" aria-label="Multi-agent market analysis team"/);
  for (const role of ["market","entry","exits","sizing","discipline","position","journal","supervisor"]) {
    assert.ok(futuresDesk.includes('value="'+role+'"'), "missing specialist role "+role);
  }
  assert.match(futuresDesk, /id="liveAgentRole8"/);
  assert.match(futuresDesk, /fetch\("\/api\/trading\/agents"/);
  assert.match(parallelAgentsRoute, /Promise\.all\(roles\.filter\(\(role:string\)=>role!=="supervisor"\)\.map\(async \(role: string\)=>/);
  assert.match(futuresDesk, /new Set\(selections\)\.size!==selections\.length/);
  assert.match(futuresDesk, /Date\.now\(\)-end>msFor\(currentInterval\)\*2\+60000/);
  assert.match(futuresDesk, /Team consensus: WAIT/);
  assert.match(futuresDesk, /const baseLong=decision\.action/);
  assert.match(futuresDesk, /window\.tarotaiAgentCommitteeApproval=committeeApproved\?/);
  assert.match(futuresDesk, /Paper entry blocked: wait for the continuous eight-role team/);
  assert.match(futuresDesk, /Select all eight trading agents before running analysis/);
  assert.match(futuresDesk, /No real exchange orders are sent/);
});


const parallelAgentsRoute = readFileSync(new URL("../app/api/trading/agents/route.ts", import.meta.url), "utf8");
const helperSourceForTests = readFileSync(new URL("../lib/trading-analysis-quality.mjs", import.meta.url), "utf8");
const historicalPatternSource = readFileSync(new URL("../public/market-patterns.js", import.meta.url), "utf8");
test("PDF extraction avoids an unconfigured pdfjs import and initializes the Node worker explicitly", () => {
  const documentsRoute = readFileSync(new URL("../app/api/documents/route.ts", import.meta.url), "utf8");
  const documentExtractor = readFileSync(new URL("../lib/document-extract.mjs", import.meta.url), "utf8");
  const nextConfig = readFileSync(new URL("../next.config.mjs", import.meta.url), "utf8");
  assert.ok(documentsRoute.includes("extractPdfText(buffer)"));
  assert.ok(!documentsRoute.includes('import { getTextExtractor } from "office-text-extractor"'));
  assert.ok(documentExtractor.includes('import("pdf-parse/worker")'));
  assert.ok(documentExtractor.includes("PDFParse.setWorker(worker.getData())"));
  assert.ok(documentExtractor.includes("CanvasFactory"));
  assert.ok(nextConfig.includes('"pdf-parse"') && nextConfig.includes('"@napi-rs/canvas"'));
});


test("historical analogue matcher uses only matured prior candles and reports observed outcomes", () => {
  const candles=[];
  for(let i=0;i<360;i++){
    const close=100+0.018*i+3.8*Math.sin(i*0.15)+1.2*Math.sin(i*0.043);
    const previous=i?candles[i-1].close:close-0.25;
    const open=previous, high=Math.max(open,close)+0.22+0.04*Math.abs(Math.sin(i*0.37));
    const low=Math.min(open,close)-0.2-0.04*Math.abs(Math.cos(i*0.29));
    candles.push({time:Date.UTC(2025,0,1)+i*900000,open,high,low,close,volume:900+250*(1+Math.sin(i*0.11)),closeTime:Date.UTC(2025,0,1)+i*900000+899999});
  }
  const study=findSimilarCases(candles,"15m",{horizon:6,maxExamples:8,maxDistance:0.8});
  assert.equal(study.ready,true);
  assert.ok(study.sampleCount>=3);
  assert.ok(study.examples.every(e=>e.time < candles.at(-1).time));
  assert.ok(study.examples.every(e=>Number.isFinite(e.forwardReturnPct)&&["UP","DOWN","FLAT"].includes(e.outcome)));
  assert.ok(study.examples.every(e=>e.time <= candles.at(-1).time-9*900000));
  const tooShort=findSimilarCases(candles.slice(-100),"15m");
  assert.equal(tooShort.ready,false);
});

test("retired free models fall back to OpenRouter free router and supervisor audits seven roles", () => {
  assert.ok(parallelAgentsRoute.includes("qwen/qwen3-next-80b-a3b-instruct:free"));
  assert.ok(parallelAgentsRoute.includes('configuredModel==="qwen/qwen3-next-80b-a3b-instruct:free"?"openrouter/free":configuredModel'));
  assert.ok(parallelAgentsRoute.includes("const unavailable=Number(response.status)===404"));
  assert.ok(parallelAgentsRoute.includes('role:"supervisor"'));
  assert.ok(parallelAgentsRoute.includes("auditSpecialistResults(results"));
  assert.ok(parallelAgentsRoute.includes("const paperTradeContext="));
  assert.ok(parallelAgentsRoute.includes("openrouter/free"));
});

test("parallel specialist API performs distinct authenticated AI calls with independently fetched candles", () => {
  assert.match(parallelAgentsRoute,/if\(!process\.env\.TAROTAI_ACCESS_CODE\)/);
  assert.match(parallelAgentsRoute,/if\(!isAuthorized\(request\)\)/);
  assert.match(parallelAgentsRoute,/OPENROUTER_API_KEY/);
  assert.match(parallelAgentsRoute,/const results=await Promise\.all\(roles\.filter\(\(role:string\)=>role!=="supervisor"\)\.map\(async \(role: string\)=>/);
  assert.match(parallelAgentsRoute,/fetchVerifiedMarket\(symbol,interval,preferred\)/);
  assert.match(parallelAgentsRoute,/findSimilarCases\(market\.candles,interval/);
  assert.match(parallelAgentsRoute,/historicalAnalogueStudy/);
  assert.match(parallelAgentsRoute,/roles\.length!==8/);
  assert.match(parallelAgentsRoute,/parseSpecialistReport\(text\)/);
  assert.match(parallelAgentsRoute,/if\(!parsed\.vetoDeclared\)throw new Error\("Specialist report omitted required VETO field\."/);
  assert.match(parallelAgentsRoute,/if\(!parsed\.biasDeclared\)throw new Error\("Specialist report omitted required BIAS field\."/);
  assert.match(parallelAgentsRoute,/auditSpecialistResults\(results/);
  assert.match(parallelAgentsRoute,/model:supervisorAudit\.model/);
  assert.match(parallelAgentsRoute,/supervisorMode:"deterministic-rule-audit"/);
  assert.match(parallelAgentsRoute,/technicalScorecard/);
  assert.match(parallelAgentsRoute,/max_tokens:500/);
  assert.match(parallelAgentsRoute,/Market Structure Analyst/);
  assert.match(parallelAgentsRoute,/Entry Setup Specialist/);
  assert.match(parallelAgentsRoute,/Stop-Loss & Take-Profit Planner/);
  assert.match(parallelAgentsRoute,/Position Sizing & Risk Manager/);
  assert.match(parallelAgentsRoute,/Execution Discipline Agent/);
  assert.match(parallelAgentsRoute,/Live Position Manager/);
  assert.match(parallelAgentsRoute,/Trade Journal & Review Analyst/);
  assert.match(parallelAgentsRoute,/level2OrderBook:false/);
  assert.match(parallelAgentsRoute,/optionsImpliedVolatilitySurface:false/);
  assert.match(parallelAgentsRoute,/riskOnProxyMaxGrossExposurePct:25/);
  assert.match(parallelAgentsRoute,/neutralMaxGrossExposurePct:10/);
  assert.match(parallelAgentsRoute,/riskOffProxyMaxGrossExposurePct:5/);
   assert.match(parallelAgentsRoute,/AbortSignal\.timeout\(14000\)/);
   assert.match(parallelAgentsRoute,/qwen\/qwen3-next-80b-a3b-instruct:free/);
   assert.match(parallelAgentsRoute,/modelCandidates/);
   assert.match(parallelAgentsRoute,/openrouter\/free/);
   assert.match(parallelAgentsRoute,/max_tokens:500/);
  assert.match(parallelAgentsRoute,/orderPlacement:false/);
  assert.doesNotMatch(parallelAgentsRoute,/fapi\.binance\.com\/fapi\/v1\/order/);
});

test("Trading Desk requests real parallel AI outputs and gates agreement on risk and historical evidence", () => {
  assert.match(futuresDesk,/<script src="\/market-patterns\.js"><\/script>/);
  assert.match(futuresDesk,/fetch\("\/api\/trading\/agents"/);
  assert.match(parallelAgentsRoute,/Promise\.all\(roles\.filter\(\(role:string\)=>role!=="supervisor"\)\.map\(async \(role: string\)=>/);
  assert.match(futuresDesk,/historical evidence inconclusive/);
  assert.match(futuresDesk,/!riskSelected/);
  assert.match(futuresDesk,/sameSnapshot/);
  assert.match(futuresDesk,/Historical analogue study/);
  assert.match(parallelAgentsRoute,/roles\.filter\(\(role:string\)=>role!=="supervisor"\)/);
  assert.match(parallelAgentsRoute,/Agent Operations Supervisor/);
  assert.match(historicalPatternSource,/root\.TarotAIMarketPatterns = \{ findSimilarCases \}/);
});


test("public market data API supports bounded, ordered historical candle pagination for all supported exchanges", () => {
  assert.match(source, /const beforeRaw=q\.get\("before"\)/);
  assert.match(source, /searchParams\.set\("endTime"/);
  assert.match(source, /searchParams\.set\("end"/);
  assert.match(source, /market\/history-candles/);
  assert.match(source, /searchParams\.set\("after"/);
  assert.match(source, /c\.time<before/);
  assert.match(source, /stale:historyPage\?false:stale/);
  assert.match(source, /historyPage/);
});

test("live chart retains historical candles, loads older pages on left-scroll, and preserves the viewed time range", () => {
  assert.match(futuresDesk, /id="liveLoadOlder"/);
  assert.match(futuresDesk, /subscribeVisibleLogicalRangeChange/);
  assert.match(futuresDesk, /async function loadOlderHistory\(\)/);
  assert.match(futuresDesk, /setVisibleLogicalRange\(\{from:rangeBefore\.from\+added,to:rangeBefore\.to\+added\}\)/);
  assert.match(futuresDesk, /slice\(-5000\)/);
  assert.match(futuresDesk, /orderedCandles\(\[\.\.\.rows,\.\.\.data\.candles\]\)/);
  assert.match(futuresDesk, /scrollToRealTime\(\)/);
});

test("multi-agent panel recovers missing or expired signed sessions without bypassing API authentication", () => {
  assert.match(futuresDesk, /id="liveAgentAuthGate"[^>]*hidden/);
  assert.match(futuresDesk, /async function ensurePrivateSession\(\)/);
  assert.match(futuresDesk, /fetch\("\/api\/auth",\{cache:"no-store",credentials:"same-origin"/);
  assert.match(futuresDesk, /async function unlockAgentSession\(\)/);
  assert.match(futuresDesk, /fetch\("\/api\/trading\/agents",\{method:"POST",cache:"no-store",credentials:"same-origin"/);
  assert.match(parallelAgentsRoute, /if\(!isAuthorized\(request\)\)return jsonError\("Authentication required\.",401\)/);
  assert.match(authRoute, /response\.cookies\.set\(COOKIE/);
});


test("live trading desk continuously runs eight distinct local roles while visible", () => {
  assert.match(futuresDesk, /function runContinuousAgentCycle\(\)/);
  assert.match(futuresDesk, /continuousTeamTimer=setInterval\(runContinuousAgentCycle,1000\)/);
  assert.match(futuresDesk, /renderLiveAgentResults\(reports,"continuousAgentResults"\)/);
  assert.match(futuresDesk, /source:"continuous-local"/);
  assert.match(futuresDesk, /id="toggleContinuousTeam"/);
  assert.match(futuresDesk, /id="continuousAgentResults"/);
  assert.match(futuresDesk, /document\.visibilityState!=="visible"/);
});

test("AI provider failures produce explicit fallback reports and block AI-review approval", () => {
  assert.match(parallelAgentsRoute, /function deterministicFallbackReport/);
  assert.match(parallelAgentsRoute, /fallback:true,providerStatus:"degraded"/);
  assert.match(parallelAgentsRoute,/const supervisorAudit=auditSpecialistResults\(results/);
  assert.match(helperSourceForTests,/r\.fallback\|\|r\.providerStatus==="degraded"/);
  assert.match(parallelAgentsRoute, /fallbackAgents:fallbackCount,aiProviderStatus:fallbackCount\?"degraded":"ok"/);
  assert.match(parallelAgentsRoute, /results\.length!==8\|\|failed!==0\|\|specialistOk!==7/);
});

test("all live chart panels share one OKX swap symbol/timeframe and current WebSocket URL", () => {
  assert.match(futuresDesk, /function updateTradingViewChart\(source="tv"\)/);
  assert.match(futuresDesk, /IN-APP CHARTS SYNCED/);
  assert.match(futuresDesk, /window\.tarotaiReloadLiveChart=/);
  assert.match(futuresDesk, /wss:\/\/ws\.okx\.com\/ws\/v5\/business/);
  assert.match(futuresDesk, /wss:\/\/ws\.okx\.com\/ws\/v5\/public/);
  assert.match(futuresDesk, /candleChannel="candle"\+/);
  assert.match(futuresDesk, /const requestedVenue=isReferenceMarket\(symbol\)\?"yahoo":\(\["binance","okx"\]\.includes\(marketVenue\)\?marketVenue:"binance"\)/);
  assert.match(parallelAgentsRoute, /const venues=\[preferred\],failures:string\[\]=\[\]/);
});

test("automatic paper trading is opt-in, persistent-ledger gated, and records one entry per approved candle", () => {
  assert.match(futuresDesk, /id="livePaperAutoToggle"/);
  assert.match(futuresDesk, /let paperBusy=false,paperOpening=false,paperStoreReady=false,autoPaperEnabled=false/);
  assert.match(futuresDesk, /window\.tarotaiContinuousTeamApproval=approve\?/);
  assert.match(futuresDesk, /autoPaperEnabled&&approve&&!paperOpening&&paperStoreReady/);
  assert.match(futuresDesk, /candleKey!==lastAutoPaperCandleKey/);
  assert.match(futuresDesk, /PAPER_ONLY/);
  assert.match(futuresDesk, /No exchange order was sent/);
});


test("unified in-app trading desk exposes one visible chart and merged strategy confirmation", () => {
  assert.match(futuresDesk, /id="liveMarketChart"/);
  assert.doesNotMatch(futuresDesk, /id="tvSyncedChart"/);
  assert.doesNotMatch(futuresDesk, /id="tradingview-panel"/);
  assert.doesNotMatch(futuresDesk, /id="visual-strategy-panel"/);
  assert.doesNotMatch(futuresDesk, /class="strategy-chart-wrap"/);
  assert.match(futuresDesk, /class="strategy-engine-legacy" hidden aria-hidden="true"/);
  assert.match(futuresDesk, /class="live-strategy-confirmation"/);
  assert.match(futuresDesk, /id="strategySignal"/);
  assert.match(futuresDesk, /id="strategyStop"/);
  assert.match(futuresDesk, /id="strategyTarget"/);
  assert.match(futuresDesk, /id="live-agent-chart"/);
  assert.match(futuresDesk, /id="chartAgentCounter"/);
  assert.match(futuresDesk, /id="tvAskAgent" type="button">Run AI-enhanced 8-agent review/);
  assert.match(futuresDesk, /function hasFreshLiveQuote\(now=Date\.now\(\)\)/);
  assert.match(futuresDesk, /function currentMarketPrice\(\)/);
  assert.match(futuresDesk, /function renderSharedQuote\(_price\)/);
  assert.match(futuresDesk, /updateTradingViewChart\("live"\)/);
});

test("continuous local rule roles refresh every second and paper entries use the shared verified last trade", () => {
  assert.match(futuresDesk, /continuousTeamTimer=setInterval\(runContinuousAgentCycle,1000\)/);
  assert.match(futuresDesk, /quoteData=await serverQuote\.json\(\)\.catch\(\(\)=>\(\{\}\)\)/);
  assert.match(futuresDesk, /const quoteObservedAt=Date\.now\(\),quoteTimestamp=Number\(quoteData\.timestamp\),quoteAge=quoteObservedAt-quoteTimestamp,entry=Number\(quoteData\.price\)/);
  assert.match(futuresDesk, /source:"continuous-local-team"/);
  assert.match(futuresDesk, /PAPER_ONLY_APPROVAL/);
  assert.match(paperRoute, /liveTradingEnabled:false/);
});


test("strategy chart, agent context and paper checks stay on the same selected live venue", () => {
  assert.match(futuresDesk, /marketVenue="binance"/);
  assert.match(futuresDesk, /const sourceVenue=window\.tarotaiMarketVenue\|\|'binance'/);
  assert.match(futuresDesk, /Research venue is separate/);
  assert.match(futuresDesk, /venue:marketVenue/);
  assert.match(paperRoute, /const symbol=String\(b\.symbol\|\|"BTCUSDT"\)\.toUpperCase\(\),venue=String\(b\.venue\|\|"binance"\)/);
});

test("paper entry checks a live OKX last-trade ticker and blocks material quote drift", () => {
  assert.match(paperRoute, /api\/v5\/market\/ticker/);
  assert.match(paperRoute, /const timestamp=Number\(ticker\?\.ts\),ageMs=Date\.now\(\)-timestamp/);
  assert.match(paperRoute, /OKX swap ticker could not be verified or is older than five seconds/);
  assert.match(paperRoute, /const timestamp=Number\(marketQuote\?\.time\),ageMs=Date\.now\(\)-timestamp/);
  assert.match(paperRoute, /Bybit linear ticker could not be verified or is older than five seconds/);
  assert.match(paperRoute, /ageMs < -1500\|\|ageMs>5000/);
  assert.match(paperRoute, /action==="OPEN"&&priceDrift>0\.002/);
  assert.match(paperRoute, /executionReferencePrice=canUseBook\?\(side==="BUY"\?verifiedAskPrice:verifiedBidPrice\):verifiedMarketPrice/);
  assert.match(paperRoute, /fapi\.binance\.com\/fapi\/v1\/ticker\/bookTicker/);
  assert.match(paperRoute, /verifiedSpreadBps<0\|\|verifiedSpreadBps>20/);
  assert.match(paperRoute, /validatePaperExposure/);
  assert.match(paperRoute, /maxTotalExposurePct:PAPER_MAX_PORTFOLIO_EXPOSURE_PCT/);
  assert.match(paperRoute, /legacy open paper position has no recorded starting balance/);
  assert.match(paperRoute, /Open paper positions have inconsistent recorded balances/);
  assert.match(paperRoute, /Paper starting balance is locked while positions are open/);
  assert.match(paperRoute, /marketSource,/);
});

test("continuous local agents veto missing or stale last-trade ticks", () => {
  assert.match(futuresDesk, /quoteFresh=hasFreshLiveQuote\(now\)/);
  assert.match(futuresDesk, /const stale=marketVenue==="yahoo"\|\|now-end>msFor\(currentInterval\)\*2\+60000\|\|!quoteFresh/);
  assert.match(futuresDesk, /livePrice=Number\(currentMarketPrice\(\)\)/);
  assert.match(futuresDesk, /STALE QUOTE — ENTRIES BLOCKED/);
});


test("Binance Futures is the canonical live chart source selected by the user", () => {
  assert.match(futuresDesk, /marketVenue="binance"/);
  assert.match(futuresDesk, /wss:\/\/fstream\.binance\.com\/ws\//);
  assert.match(source, /https:\/\/fapi\.binance\.com\/fapi\/v1\/klines/);
  assert.match(parallelAgentsRoute, /fapi\/v1\/klines/);
  assert.match(paperRoute, /https:\/\/fapi\.binance\.com\/fapi\/v1\/ticker\/bookTicker/);
  assert.match(liveQuoteRoute, /https:\/\/fapi\.binance\.com\/fapi\/v1\/ticker\/bookTicker/);
  assert.match(liveQuoteRoute, /fapi\.binance\.com\/fapi\/v1\/ticker\/bookTicker/);
  assert.match(liveQuoteRoute, /priceBasis: "best-bid\/ask midpoint"/);
  assert.match(liveQuoteRoute, /payload\?\.time/);
  assert.match(liveQuoteRoute, /spreadAvailable: Number\.isFinite\(spread\.spreadBps\)/);
  assert.match(liveQuoteRoute, /ageMs > 5000/);
  assert.doesNotMatch(liveQuoteRoute, /fapi\.binance\.com\/fapi\/v1\/ticker\/24hr/);
  assert.match(futuresDesk, /channel:"trades",instId/);
  assert.match(futuresDesk, /id="liveRefresh"/);
  assert.match(futuresDesk, /id="tvAskAgent" type="button">Run AI-enhanced 8-agent review/);
  assert.doesNotMatch(futuresDesk, /id="tvSyncedChart"/);
});


test("independent strategy confirmation supports every market listed on the main chart",()=>{
  assert.ok(futuresDesk.includes('id="liveSymbol"><option value="BTCUSDT">BTC/USDT perpetual') && futuresDesk.includes('<option value="NIFTY50">NIFTY 50 (NSE · delayed reference)</option><option value="GOLD">Gold Futures (COMEX · USD/oz · delayed reference)</option>'),"main chart lists both added reference markets after the crypto contracts");
  assert.ok(futuresDesk.includes('id="strategySymbol"><option value="BTCUSDT">BTC/USDT') && futuresDesk.includes('<option value="NIFTY50">NIFTY 50 (reference only)</option><option value="GOLD">Gold Futures (reference only)</option>'),"strategy chart recognizes both reference symbols");
  assert.match(futuresDesk, /\$\("strategySymbol"\)\.value=base/);
});

test("strategy fallback and the unified in-app chart use the same selected Binance venue", () => {
  assert.match(futuresDesk, /window\.tarotaiMarketVenue=marketVenue/);
  assert.match(futuresDesk, /const sourceVenue=window\.tarotaiMarketVenue\|\|'binance'/);
  assert.match(futuresDesk, /const tvExchange=\(\{binance:'BINANCE',bybit:'BYBIT',okx:'OKX'\}\)\[window\.tarotaiMarketVenue\]\|\|'BINANCE'/);
  assert.doesNotMatch(futuresDesk, /const tvSymbol='BINANCE:'/);
  const updateFn=futuresDesk.slice(futuresDesk.indexOf('function updateTradingViewChart'),futuresDesk.indexOf('$("tvRefresh")'));
  assert.equal((updateFn.match(/window\.tarotaiReloadLiveChart\(\)/g)||[]).length,1);
});

test("OKX candles and trade ticks use their correct WebSocket services", () => {
  assert.match(futuresDesk, /wss:\/\/ws\.okx\.com\/ws\/v5\/business/);
  assert.match(futuresDesk, /wss:\/\/ws\.okx\.com\/ws\/v5\/public/);
  assert.match(futuresDesk, /channel:"trades",instId/);
  assert.match(futuresDesk, /channel:candleChannel,instId/);
  assert.match(futuresDesk, /msg\?\.event==="error"/);
});

test("market data and agent APIs default to Binance Futures", () => {
  assert.match(source, /const venue=\(q\.get\("venue"\)\|\|"binance"\)\.toLowerCase\(\)/);
  assert.match(parallelAgentsRoute, /preferred=String\(body\?\.venue\|\|"binance"\)\.toLowerCase\(\) as Venue/);
});


test("paper close and stop checks keep using the recorded trade venue", () => {
  assert.match(futuresDesk, /function paperTradeVenue\(t\)/);
  assert.match(futuresDesk, /venue:paperTradeVenue\(t\)/);
  assert.match(futuresDesk, /venue:tradeVenue/);
  assert.match(futuresDesk, /tradeVenue===marketVenue&&Number\.isFinite\(lastTradePrice\)/);
  assert.doesNotMatch(futuresDesk, /new URLSearchParams\(\{venue:"binance",symbol:t\.symbol/);
});


test("demo order ticket uses live agent decision and persistent paper execution, not illustrative manual prices", () => {
  assert.match(futuresDesk, /id="agentPaperTicket"/);
  assert.match(futuresDesk, /id="demoLivePrice"/);
  assert.match(futuresDesk, /id="demoAgentStop"/);
  assert.match(futuresDesk, /id="demoAgentTarget"/);
  assert.match(futuresDesk, /id="demoAgentOpen"[^>]*disabled/);
  assert.doesNotMatch(futuresDesk, /Illustrative entry price/);
  assert.doesNotMatch(futuresDesk, /id="entry"/);
  assert.doesNotMatch(futuresDesk, /id="stop"/);
  assert.doesNotMatch(futuresDesk, /id="target"/);
  assert.match(futuresDesk, /byId\("demoAgentOpen"\)\.addEventListener\("click",paperOpenSignal\)/);
  assert.match(futuresDesk, /const stop=Number\(d\.stop\),long=d\.action==="BUY \/ LONG"/);
  assert.match(futuresDesk, /const distance=Math\.abs\(entry-stop\),riskBudget=balance\*riskPct\/100,notionalCap=balance\*maxExposurePct\/100/);
  assert.match(futuresDesk, /action:"OPEN",symbol:d\.symbol,venue:marketVenue/);
  assert.match(futuresDesk, /function updateDemoAgentTicket\(\)/);
  assert.match(futuresDesk, /if\(checks\.length\)\{d=await paperRequest/);
});


test("strategy chart uses the shared live quote and refreshes automatically", () => {
  assert.match(futuresDesk, /<label>Live bid\/ask midpoint<\/label><strong id="strategyPrice"/);
  assert.match(futuresDesk, /window\.tarotaiSharedLastPrice=price/);
  assert.match(futuresDesk, /window\.tarotaiUpdateStrategyLiveQuote\(price,now\)/);
  assert.match(futuresDesk, /quoteFresh\?quote\.toLocaleString/);
  assert.match(futuresDesk, /LIVE '\+liveP\.toLocaleString/);
  assert.match(futuresDesk, /strategyRefreshTimer=setInterval/);
  assert.match(futuresDesk, /startStrategyAutoRefresh\(\);if\(document\.visibilityState==='visible'\)/);
  assert.match(futuresDesk, /window\.tarotaiStrategyCandles=null/);
});

test("market-data status reports the actual selected venue rather than a hard-coded exchange", () => {
  assert.match(futuresDesk, /Source: "\+\(\{binance:"Binance USDⓈ-M Futures",bybit:"Bybit linear perpetual",okx:"OKX perpetual swap"\}\[marketVenue\]/);
});

test("Binance chart has a native interval-specific kline stream and only re-analyzes each closed bar once", () => {
  assert.match(futuresDesk, /@kline_"\+currentInterval/);
  assert.match(futuresDesk, /message\?\.e!==\"kline\"/);
  assert.match(futuresDesk, /confirmed:k\.x===true/);
  assert.match(futuresDesk, /function analyzeNewClosedBar\(\)/);
  assert.match(futuresDesk, /lastAnalyzedClosedCandleTime/);
});

test("paper UI measures current spread and passes server-enforced exposure inputs instead of pretending spread is zero", () => {
  assert.match(futuresDesk, /spreadBps=Number\(quoteData\.spreadBps\)/);
  assert.match(futuresDesk, /spreadBps\}\)/);
  assert.match(futuresDesk, /maxExposurePct=5/);
  assert.match(futuresDesk, /paperBalance:balance,riskPct,maxExposurePct/);
  assert.doesNotMatch(futuresDesk, /spreadBps:0/);
  assert.match(futuresDesk, /5% notional per position/);
});

test("agent and paper-order previews enforce 5% position and 20% portfolio exposure caps",()=>{
  assert.match(futuresDesk, /positionNotionalCap=balance\*\.05,portfolioNotionalCap=balance\*\.20/);
  assert.match(futuresDesk, /existingOpenNotional\+qty\*entry<=portfolioNotionalCap/);
  assert.match(futuresDesk, /const now=Date\.now\(\),fresh=hasFreshLiveQuote\(now\)/);
  assert.match(futuresDesk, /Math\.min\(riskBudget\/distance,notionalCap\/entry,remainingPortfolioNotional\/entry\)/);
  assert.match(futuresDesk, /existingOpenNotional\+quantity\*entry>portfolioNotionalCap/);
  assert.match(futuresDesk, /existingOpenNotional\+quantity\*entryReference>portfolioNotionalCap/);
  assert.match(futuresDesk, /persistent paper ledger must be loaded before sizing or opening a position/);
});

test("active paper positions survive the bounded trade-history window",()=>{
  assert.match(paperRoute, /const OPEN_POSITIONS_KEY="tarotai:paper:open_positions"/);
  assert.match(paperRoute, /d\.hgetall<Record<string,string>>\(OPEN_POSITIONS_KEY\)/);
  assert.match(paperRoute, /if\(!seen\.has\(trade\.id\)\)\{rows\.push\(trade\);seen\.add\(trade\.id\);\}/);
  assert.match(paperRoute, /async function readPaperLedger\(d:Redis\)/);
  assert.match(paperRoute, /if\(action==="OPEN"\)await d\.hset\(OPEN_POSITIONS_KEY/);
  assert.match(paperRoute, /if\(action==="CLOSE"&&parentTrade\)\{await d\.hdel\(OPEN_POSITIONS_KEY,parentTrade\.id\);await d\.hdel\(STOP_CURSORS_KEY,parentTrade\.id\);\}/);
  assert.match(paperRoute, /await d\.hdel\(OPEN_POSITIONS_KEY,trade\.id\)/);
  assert.match(paperRoute, /for\(const openTrade of openRows\)await d\.hset\(OPEN_POSITIONS_KEY/);
  assert.match(paperRoute, /historyRetentionLimit:1000/);
});

test("paper ledger writes and stop checks are serialized with an expiring token-guarded lock",()=>{
  assert.match(paperRoute, /needsLedgerLock=\["OPEN","CLOSE","STOP_CHECK","REPLAY"\]\.includes\(action\)/);
  assert.match(paperRoute, /d\.set\(lockKey,lockToken,\{nx:true,px:60000\}\)/);
  assert.match(paperRoute, /Another paper-ledger operation is in progress/);
  assert.match(paperRoute, /d\.eval\("if redis\.call\('get', KEYS\[1\]\) == ARGV\[1\] then return redis\.call\('del', KEYS\[1\]\) else return 0 end"/);
  assert.match(paperRoute, /\}finally\{/);
});

test("chart shows current activity of the eight continuous local rule roles",()=>{
  assert.match(futuresDesk, /id="chartAgentCounter"/);
  assert.match(futuresDesk, /function setChartAgentCounter\(value,detail,mode="warn"\)/);
  assert.match(futuresDesk, /setChartAgentCounter\("8\/8 AGENTS ACTIVE"/);
  assert.match(futuresDesk, /continuousTeamTimer=setInterval\(runContinuousAgentCycle,1000\)/);
  assert.match(futuresDesk, /no LLM calls in this loop/);
  assert.match(futuresDesk, /The local roles are not eight separate LLM calls/);
});

test("target-only observation trades ignore stop-only touches and stay outside signal accuracy metrics",()=>{
  assert.match(paperRoute, /resolveTargetOnlyObservation/);
  assert.match(paperRoute, /targetOnlyObservation=trade\.experimentMode==="target-only-observation"/);
  assert.match(paperRoute, /openedAt<closedCandles\[0\]\.time&&!hasCursor&&!targetOnlyObservation/);
  assert.match(paperRoute, /decisionSource=experimentMode\?"target-only-observation"/);
  assert.match(paperRoute, /experimentMode:experimentMode\|\|null/);
  assert.match(paperRoute, /experimentObservation/);
  assert.match(paperRoute, /result=targetOnlyObservation[\s\S]*?resolveTargetOnlyObservation/);
  assert.match(futuresDesk, /id="livePaperObservationOpen"/);
  assert.match(futuresDesk, /async function paperOpenObservation\(\)/);
  assert.match(futuresDesk, /strategyCloses=closed\.filter/);
  assert.match(futuresDesk, /Observation trials are excluded from strategy win-rate stats/);
});
test("Binance live chart renders automatic support, resistance, trendlines and shared live ticks", () => {
  assert.match(futuresDesk, /marketVenue="binance"/);
  assert.match(futuresDesk, /wss:\/\/fstream\.binance\.com\/ws\//);
  assert.match(futuresDesk, /function drawStructureAnnotations\(candles,currentAtr\)/);
  assert.match(futuresDesk, /Auto support/);
  assert.match(futuresDesk, /Auto resistance/);
  assert.match(futuresDesk, /Rising swing-low trendline/);
  assert.match(futuresDesk, /Falling swing-high trendline/);
  assert.match(futuresDesk, /mirrorSupportSeries/);
  assert.match(futuresDesk, /mirrorRisingTrendSeries/);
  assert.match(futuresDesk, /lastQuoteSource===marketVenue\+"-websocket"/);
  assert.match(source, /https:\/\/fapi\.binance\.com\/fapi\/v1\/klines/);
  assert.match(paperRoute, /https:\/\/fapi\.binance\.com\/fapi\/v1\/ticker\/bookTicker/);
});


test("live quote fallback uses the selected venue and blocks stale prices", () => {
  assert.match(liveQuoteRoute, /api\/v5\/market\/ticker/);
  assert.match(liveQuoteRoute, /new Set\(\["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT"\]\)/);
  assert.match(liveQuoteRoute, /ageMs > 5000/);
  assert.match(liveQuoteRoute, /"Cache-Control": "no-store"/);
  assert.match(futuresDesk, /function hasFreshLiveQuote\(now=Date\.now\(\)\)/);
  assert.match(futuresDesk, /function refreshQuoteFallback\(\)/);
  assert.match(futuresDesk, /quoteFallbackTimer=setInterval/);
  assert.match(futuresDesk, /lastQuoteSource===marketVenue\+"-rest-ticker"/);
  assert.match(futuresDesk, /LIVE PRICE STALE/);
  assert.match(futuresDesk, /if\(!hasFreshLiveQuote\(\)\)/);
  assert.doesNotMatch(futuresDesk, /reloadAll\(true\)/);
});

test("document extraction regression guards the earlier DOMMatrix runtime failure", () => {
  const workerImport = documentExtract.indexOf('await import("pdf-parse/worker")');
  const parserImport = documentExtract.indexOf('await import("pdf-parse")');
  assert.ok(workerImport >= 0 && parserImport > workerImport, "load the Node worker before importing PDFParse");
  assert.match(documentExtract, /PDFParse\.setWorker\(worker\.getData\(\)\)/);
  assert.match(documentsRoute, /await extractPdfText\(buffer\)/);
  assert.match(readFileSync(new URL("./documents.test.mjs", import.meta.url), "utf8"), /await extractPdfText\(createPdfFixture\(\)\)/);
});


test("stale last-trade feed is never relabeled as a live quote", () => {
  assert.match(futuresDesk, /byId\("livePrice"\)\.textContent=fresh\?fmt\(price\):"STALE"/);
  assert.match(futuresDesk, /LIVE PRICE STALE/);
  assert.match(futuresDesk, /window\.tarotaiSharedLastPrice=price/);
  assert.match(futuresDesk, /if\(fresh\)\{/);
  assert.match(futuresDesk, /function hasFreshLiveQuote\(now=Date\.now\(\)\)/);
});


test("the single live chart quote marker updates without rewriting traded candle OHLC", () => {
  assert.match(futuresDesk, /currentSymbol\.toLowerCase\(\)\+"@bookTicker"/);
  assert.match(futuresDesk, /const bid=Number\(tick\.b\),ask=Number\(tick\.a\),price=\(bid\+ask\)\/2/);
  assert.match(futuresDesk, /mainLivePriceLine=candleSeries\.createPriceLine\(\{price,color:"#54c8ff"/);
  assert.doesNotMatch(futuresDesk, /id="tvSyncedChart"/);
  assert.match(futuresDesk, /mainLivePriceLine=candleSeries\.createPriceLine\(\{price,color:"#54c8ff"/);
  assert.match(futuresDesk, /liveP=Number\(window\.tarotaiSharedLastPrice\)/);
  assert.match(futuresDesk, /if\(liveQuoteFresh&&liveP>=min&&liveP<=max\)/);
  assert.match(futuresDesk, /const sourceMaxAge=reference\?\(currentMarketReference\?\.marketOpen\?20\*60\*1000:7\*24\*60\*60\*1000\):lastQuoteSource===marketVenue\+"-rest-ticker"\?3500:3000/);
  assert.match(futuresDesk, /const bid=Number\(tick\.b\),ask=Number\(tick\.a\),price=\(bid\+ask\)\/2,ts=Number\(tick\.E\|\|tick\.T\),receivedAt=Date\.now\(\),exchangeAge=receivedAt-ts/);
  assert.match(futuresDesk, /const price=Number\(tick\.px\),quoteAt=Date\.now\(\),ts=Number\(tick\.ts\),exchangeAge=quoteAt-ts/);
  assert.doesNotMatch(futuresDesk, /syncLiveQuoteToCurrentCandle/);
  assert.doesNotMatch(futuresDesk, /forming\.close=quote/);
  assert.match(futuresDesk, /streamWasStale=marketVenue!=="yahoo"&&Date\.now\(\)-lastMarketUpdateAt>5000/);
  assert.match(futuresDesk, /pollTimer=setInterval\(\(\)=>\{if\(document\.visibilityState==="visible"&&Date\.now\(\)-lastMarketUpdateAt>\(marketVenue==="yahoo"\?15000:5000\)\)void refresh\(true\);\},5000\)/);
});

test("strategy signal calculations remain based on closed candles while displaying the active candle", () => {
  assert.match(futuresDesk, /const closes=candles\.map\(c=>c\.close\),fast=strategyEma\(closes,9\)/);
  assert.match(futuresDesk, /const view=data\.map/);
  assert.match(futuresDesk, /view\.push\(\{\.\.\.activeCandle,index:candles\.length,fast:visualFast/);
  assert.match(futuresDesk, /const last=candles\.length-1,prev=candles\[last-1\]/);
  assert.match(futuresDesk, /closedOnly\(rows,currentInterval\)/);
});


test("NIFTY 50 and Gold are mapped to read-only delayed Yahoo reference data",()=>{
  assert.ok(source.includes('NIFTY50:{providerSymbol:"^NSEI"'));
  assert.ok(source.includes('GOLD:{providerSymbol:"GC=F"'));
  assert.ok(source.includes('marketDataMode:"delayed-reference-read-only"'));
  assert.ok(source.includes('readOnly:true,orderPlacement:false'));
  assert.ok(liveQuoteRoute.includes('Yahoo Finance delayed reference price'));
  assert.ok(futuresDesk.includes('REFERENCE ONLY —'));
  assert.ok(futuresDesk.includes('marketVenue==="yahoo"||isReferenceMarket(byId("liveSymbol").value)'));
  assert.ok(futuresDesk.includes('AUTO PAPER BLOCKED: NIFTY 50 and Gold are delayed reference markets'));
  assert.ok(futuresDesk.includes('sourceMaxAge=reference?(currentMarketReference?.marketOpen?20*60*1000:7*24*60*60*1000)'),"last official reference quotes remain visible briefly after the market closes");
  assert.ok(futuresDesk.includes('maxSourceAge=quoteVenue==="yahoo"?(data.marketOpen?20*60*1000:7*24*60*60*1000):3000'),"after-hours fallback accepts a recent official close for up to seven days");
  assert.ok(futuresDesk.includes(' · MARKET CLOSED'),"closed reference sessions are labelled rather than called live");
});


test("Yahoo reference candles use quote freshness for daily HTF and interval-aware candle freshness",()=>{
  assert.match(source,/const freshnessAgeMs=interval==="1d"\?quoteAgeMs:candleAgeMs/);
  assert.match(source,/const freshnessLimitMs=interval==="1d"\?25\*60\*1000:25\*60\*1000\+Math\.max\(0,\(DURATIONS\[interval\]\|\|60000\)-15\*60\*1000\)/);
  assert.match(source,/freshnessAgeMs>freshnessLimitMs/);
});

test("Yahoo chart polling preserves its cached quote and keeps reference-feed status explicit",()=>{
  assert.match(futuresDesk,/symbolChanged=sym!==currentSymbol,changed=symbolChanged\|\|interval!==currentInterval/);
  assert.match(futuresDesk,/if\(venueChanged\|\|symbolChanged\|\|\(changed&&marketVenue!==\"yahoo\"\)\|\|streamWasStale\|\|\(marketVenue!==\"yahoo\"&&\(!feedSocket\|\|feedSocket\.readyState!==WebSocket\.OPEN\)\)\)connectSocket\(\)/);
  assert.match(futuresDesk,/YAHOO FINANCE · DELAYED REFERENCE ONLY · "\+state/);
  assert.match(futuresDesk,/if\(marketVenue!==\"yahoo\"\)connectSocket\(\)/);
  assert.match(futuresDesk,/void refreshQuoteFallback\(\)/);
});


test("paper route enforces daily entry/loss brakes and persists long-session stop-check progress", () => {
  assert.match(paperRoute, /validatePaperDailyRisk\(\{ledger:existingRows,balance:dailyBaseline,now:Date\.now\(\)\}\)/);
  assert.match(paperRoute, /tarotai:paper:daily_balance:/);
  assert.match(paperRoute, /STOP_CURSORS_KEY/);
  assert.match(paperRoute, /lastProcessedCandleTime:lastProcessedTime/);
  assert.match(paperRoute, /await d\.hset\(STOP_CURSORS_KEY/);
  assert.match(paperRoute, /await d\.hdel\(STOP_CURSORS_KEY,trade\.id\)/);
});

test("trading chart displays persistent paper position size and estimates mark P&L", () => {
  const desk = readFileSync(new URL("../public/trading-desk.html", import.meta.url), "utf8");
  assert.match(desk, /id="agentOrderBar"/);
  assert.match(desk, /id="agentOpenNotional"/);
  assert.match(desk, /id="agentActiveOrderSize"/);
  assert.match(desk, /Estimated after entry \+ exit fees; exit slippage excluded/);
  assert.match(desk, /localStorage\.getItem\("tarotaiAutoPaperTrading"\)/);
  assert.match(desk, /void setAutoPaperEnabled\(true,false\)/);
});


test("specialist completeness, evidence scorecard and deterministic audit are wired into the live trading desk",()=>{
 const quality=readFileSync(new URL("../lib/trading-analysis-quality.mjs",import.meta.url),"utf8");
 assert.match(quality,/Setup evidence score \(not win probability\)/);
 assert.match(quality,/export function computeTechnicalScorecard/);
 assert.match(quality,/export function auditSpecialistResults/);
 assert.match(parallelAgentsRoute,/if\(!parsed\.complete\)throw new Error\("Specialist report omitted required fields:/);
 assert.match(futuresDesk,/Setup evidence \(not probability\)/);
 assert.match(futuresDesk,/scorecard\.long\.score/);
 assert.match(quality,/Material directional conflict/);
 assert.match(futuresDesk, /id="orderflowCanvas"/);
 assert.match(futuresDesk, /@depth20@100ms/);
 assert.match(futuresDesk, /@aggTrade/);
 assert.match(futuresDesk, /m\?\.m===true\?"SELL":"BUY"/);
 assert.match(futuresDesk, /window\.tarotaiOrderFlowSummary=/);
 assert.match(futuresDesk, /SHADOW MODE/);
 assert.match(futuresDesk, /does not yet change trade approvals/);
 assert.match(futuresDesk, /depthFresh&&tradeFresh/);
 assert.match(futuresDesk, /same selected symbol as the price chart/i);
 assert.match(futuresDesk, /orderFlow:window\.tarotaiOrderFlowSummary/);
 assert.match(paperRoute, /const orderFlowAtEntry=action==="OPEN"&&flowMatches/);
 assert.match(paperRoute, /orderFlowAtEntry:parentTrade\?\.orderFlowAtEntry\|\|orderFlowAtEntry/);
});

test("order-flow observer never publishes unsupported venue snapshots and pauses cleanly when hidden",()=>{
 assert.match(futuresDesk,/window\.tarotaiOrderFlowSummary=marketVenue==="binance"\?\{/);
 assert.match(futuresDesk,/if\(document\.visibilityState!=="visible"\)\{stopOrderFlowSockets\(true\);if\(orderFlowDrawTimer\)\{clearInterval\(orderFlowDrawTimer\);orderFlowDrawTimer=null;\}ofStatus\("PAUSED · TAB HIDDEN"\);return;\}/);
 assert.match(futuresDesk,/if\(marketVenue!=="binance"\)\{[\s\S]*?orderFlowSymbol="";if\(orderFlowDrawTimer\)\{clearInterval\(orderFlowDrawTimer\);orderFlowDrawTimer=null;\}ofStatus\("BINANCE FUTURES ONLY","bad"\);/);
 const visibilityHandler=futuresDesk.split("\n").find(line=>line.includes('document.addEventListener("visibilitychange"'));
 assert.ok(visibilityHandler&&visibilityHandler.includes("connectOrderFlow()")&&visibilityHandler.includes("stopOrderFlowSockets(true)"),"foreground resumes feed; background clears stale shadow data");
});

test("aggregate-trade websocket uses the verified Binance market path while depth keeps its tested path",()=>{
 assert.match(futuresDesk,/new WebSocket\("wss:\/\/fstream\.binance\.com\/market\/ws\/"\+currentSymbol\.toLowerCase\(\)\+"@aggTrade"\)/);
 assert.match(futuresDesk,/new WebSocket\("wss:\/\/fstream\.binance\.com\/ws\/"\+currentSymbol\.toLowerCase\(\)\+"@depth20@100ms"\)/);
 assert.match(futuresDesk,/m\?\.m===true\?"SELL":"BUY"/);
});
