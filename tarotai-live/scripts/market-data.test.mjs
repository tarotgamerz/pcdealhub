import test from "node:test";
import assert from "node:assert/strict";
import scenarioEngine from "../public/trading-scenarios.js";
import { readFileSync } from "node:fs";
import { findSimilarCases } from "../lib/market-patterns.mjs";

const source = readFileSync(new URL("../app/api/exchanges/market/route.ts", import.meta.url), "utf8");
const consolePage = readFileSync(new URL("../public/console.html", import.meta.url), "utf8");
const agentPage = readFileSync(new URL("../public/agents.html", import.meta.url), "utf8");
const chatRoute = readFileSync(new URL("../app/api/chat/route.ts", import.meta.url), "utf8");
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
const tradingDeskPage = readFileSync(new URL("../public/trading-desk.html", import.meta.url), "utf8");
const orderflowPanelScript = readFileSync(new URL("../public/orderflow-panel.js", import.meta.url), "utf8");

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
  assert.match(chatRoute, /const requestedMode = \["chat", "research", "code", "work", "trading"\]/);
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
  assert.match(futuresDesk, /Paper entry blocked: the exact candle needs fresh signed model-backed server risk approval/);
  assert.match(futuresDesk, /Select all eight trading agents before running analysis/);
  assert.match(futuresDesk, /No real exchange orders are sent/);
});


const parallelAgentsRoute = readFileSync(new URL("../app/api/trading/agents/route.ts", import.meta.url), "utf8");
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
  assert.ok(parallelAgentsRoute.includes("priorReports"));
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
  assert.match(parallelAgentsRoute,/vetoDeclared:!!v/);
  assert.match(parallelAgentsRoute,/if\(!parsed\.vetoDeclared\)throw new Error\("Specialist report omitted required VETO field\."/);
  assert.match(parallelAgentsRoute,/if\(!parsed\.biasDeclared\)throw new Error\("Specialist report omitted required BIAS field\."/);
  assert.ok(parallelAgentsRoute.includes('if(!monitorBias.vetoDeclared)throw new Error("Supervisor report omitted required VETO field.");'));
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
   assert.match(parallelAgentsRoute,/max_tokens:1200/);
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
  assert.match(parallelAgentsRoute, /providerDegraded\|\|results\.some\(r=>!r\.ok\)\|\|monitorBias\.veto/);
  assert.match(parallelAgentsRoute, /fallbackAgents:fallbackCount,aiProviderStatus:fallbackCount\?"degraded":"ok"/);
  assert.match(parallelAgentsRoute, /results\.length!==8\|\|failed!==0\|\|specialistOk!==7/);
});

test("all live chart panels share one OKX swap symbol/timeframe and current WebSocket URL", () => {
  assert.match(futuresDesk, /function updateTradingViewChart\(source="tv"\)/);
  assert.match(futuresDesk, /PRIMARY LIVE CHART SYNCED/);
  assert.match(futuresDesk, /window\.tarotaiReloadLiveChart=/);
  assert.match(futuresDesk, /wss:\/\/ws\.okx\.com\/ws\/v5\/business/);
  assert.match(futuresDesk, /wss:\/\/ws\.okx\.com\/ws\/v5\/public/);
  assert.match(futuresDesk, /candleChannel="candle"\+/);
  assert.match(futuresDesk, /for\(const venue of \[marketVenue\]\)/);
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


test("the Trading Desk renders one canonical chart and retains external TradingView access", () => {
  assert.match(futuresDesk, /id="liveMarketChart"/);
  assert.doesNotMatch(futuresDesk, /<div id="tvSyncedChart"/);
  assert.match(futuresDesk, /id="tradingview-compat" hidden/);
  assert.match(futuresDesk, /id="visual-strategy-panel" hidden/);
  assert.match(futuresDesk, /id="tvOpenExternal"/);
  assert.doesNotMatch(futuresDesk, /<iframe id="tvChart"/);
  assert.match(futuresDesk, /function createMirrorChart\(\)/);
  assert.match(futuresDesk, /mirrorCandleSeries\.setData\(candleData\)/);
  assert.match(futuresDesk, /channel:"trades",instId/);
  assert.match(futuresDesk, /function hasFreshLiveQuote\(now=Date\.now\(\)\)/);
  assert.match(futuresDesk, /function currentMarketPrice\(\)/);
  assert.match(futuresDesk, /function renderSharedQuote\(_price\)/);
  assert.match(futuresDesk, /Open TradingView/);
});

test("continuous local rule roles refresh every second and paper entries use the shared verified last trade", () => {
  assert.match(futuresDesk, /continuousTeamTimer=setInterval\(runContinuousAgentCycle,1000\)/);
  assert.match(futuresDesk, /const entry=Number\(currentMarketPrice\(\)\)/);
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
  assert.match(paperRoute, /action==="OPEN"&&priceDrift>0\.002/);
  assert.match(paperRoute, /executionReferencePrice=action==="CLOSE"\?verifiedMarketPrice:price/);
  assert.match(paperRoute, /marketSource,/);
});

test("continuous local agents veto missing or stale last-trade ticks", () => {
  assert.match(futuresDesk, /quoteFresh=hasFreshLiveQuote\(now\)/);
  assert.match(futuresDesk, /const stale=now-end>msFor\(currentInterval\)\*2\+60000\|\|!quoteFresh/);
  assert.match(futuresDesk, /livePrice=Number\(currentMarketPrice\(\)\)/);
  assert.match(futuresDesk, /STALE QUOTE — ENTRIES BLOCKED/);
});


test("Binance Futures is the canonical live chart source selected by the user", () => {
  assert.match(futuresDesk, /marketVenue="binance"/);
  assert.ok(futuresDesk.includes('quoteSocket=new WebSocket("wss://fstream.binance.com/market/ws/"+currentSymbol.toLowerCase()+"@aggTrade")'));
  assert.equal(futuresDesk.split("wss://fstream.binance.com/ws/").length - 1, 0, "the retired generic Futures WebSocket URL must not return");
  assert.match(source, /https:\/\/fapi\.binance\.com\/fapi\/v1\/klines/);
  assert.match(parallelAgentsRoute, /fapi\/v1\/klines/);
  assert.match(paperRoute, /https:\/\/fapi\.binance\.com\/fapi\/v1\/ticker\/price/);
  assert.match(liveQuoteRoute, /https:\/\/fapi\.binance\.com\/fapi\/v1\/ticker\/price/);
  assert.match(futuresDesk, /channel:"trades",instId/);
  assert.match(futuresDesk, /Open TradingView/);
});


test("strategy fallback and the canonical in-app chart use the selected Binance venue", () => {
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
  assert.match(futuresDesk, /const entry=Number\(currentMarketPrice\(\)\),planEntry=Number\(gatePlan\.entry\),stop=Number\(gatePlan\.stop\),target=Number\(gatePlan\.target\)/);
  assert.match(futuresDesk, /action:"OPEN",symbol:d\.symbol,venue:marketVenue/);
  assert.match(futuresDesk, /function updateDemoAgentTicket\(\)/);
  assert.match(futuresDesk, /if\(checks\.length\)\{d=await paperRequest/);
});


test("Binance Futures depth and aggregate-trade feeds use their current combined-stream categories", () => {
  const flow = readFileSync(new URL("../public/orderflow-panel.js", import.meta.url), "utf8");
  assert.equal(flow.split("wss://fstream.binance.com/public/stream?streams=").length - 1, 1,
    "depth must use the Public stream category");
  assert.equal(flow.split("wss://fstream.binance.com/market/stream?streams=").length - 1, 1,
    "aggregate trades must use the Market stream category");
  assert.equal(flow.split("wss://fstream.binance.com/ws/").length - 1, 0,
    "do not use the retired generic stream URL");
  assert.ok(flow.includes('packet && packet.data && typeof packet.data === "object" ? packet.data : packet'),
    "combined stream envelopes must be unwrapped");
});

test("manual closes and automatic stop checks share an atomic paper-position close claim", () => {
  assert.match(paperRoute, /tarotai:paper:close-claims:\"\+trade\.id/);
  assert.match(paperRoute, /tarotai:paper:close-claims:\"\+parentTrade\.id/);
  assert.match(paperRoute, /d\.set\(closeClaimKey,\"1\",\{ex:120,nx:true\}\)/);
  assert.match(paperRoute, /A close or stop\/target event is already being recorded/);
  assert.match(paperRoute, /catch\(error\)\{await d\.del\(closeClaimKey\);throw error;\}/);
});

test("paper-entry approvals require signed short-lived server tokens, fresh books, and single-use execution", () => {
  const approval = readFileSync(new URL("../lib/paper-approval.mjs", import.meta.url), "utf8");
  assert.match(parallelAgentsRoute, /createPaperApprovalToken/);
  assert.match(parallelAgentsRoute, /orderBookSnapshot=await fetchOrderBookSnapshot\(symbol,market\.venue\)/);
  assert.match(parallelAgentsRoute, /approvalToken/);
  assert.match(reviewRoute, /verifyPaperApprovalToken/);
  assert.match(reviewRoute, /fetchFreshBook/);
  assert.match(reviewRoute, /paperExecutionToken/);
  assert.match(paperRoute, /verifyPaperApprovalToken/);
  assert.match(paperRoute, /tokenType!=="PAPER_EXECUTION"/);
  assert.match(paperRoute, /tarotai:paper:approvals:used:/);
  assert.match(paperRoute, /nx:true/);
  assert.match(futuresDesk, /approval\.riskGate\?\.approved===true/);
  assert.match(futuresDesk, /paperExecutionToken/);
  assert.match(futuresDesk, /Local-rule-only approval is not enough/);
  assert.match(approval, /timingSafeEqual/);
  assert.match(approval, /PAPER_BOOK_MAX_AGE_MS/);
});

test("legacy strategy canvas remains quote-aware but does not poll while hidden", () => {
  assert.match(futuresDesk, /<label>Live last trade<\/label><strong id="strategyPrice"/);
  assert.match(futuresDesk, /window\.tarotaiSharedLastPrice=price/);
  assert.match(futuresDesk, /window\.tarotaiUpdateStrategyLiveQuote\(price,now\)/);
  assert.match(futuresDesk, /quoteFresh\?quote\.toLocaleString/);
  assert.match(futuresDesk, /LIVE '\+liveP\.toLocaleString/);
  assert.match(futuresDesk, /strategyRefreshTimer=setInterval/);
  assert.ok(futuresDesk.includes("window.tarotaiUpdateStrategyLiveQuote=function(price,now){if($('visual-strategy-panel')?.hidden)return;"));
    assert.match(futuresDesk, /startStrategyAutoRefresh\(\);if\(document\.visibilityState==='visible'&&!\$\('visual-strategy-panel'\)\?\.hidden\)/);
  assert.match(futuresDesk, /window\.tarotaiStrategyCandles=null/);
});

test("market-data status reports the actual selected venue rather than a hard-coded exchange", () => {
  assert.match(futuresDesk, /Source: "\+\(\{binance:"Binance USDⓈ-M Futures",bybit:"Bybit linear perpetual",okx:"OKX perpetual swap"\}\[marketVenue\]/);
});

test("Binance live chart renders automatic support, resistance, trendlines and shared live ticks", () => {
  assert.match(futuresDesk, /marketVenue="binance"/);
  assert.ok(futuresDesk.includes('quoteSocket=new WebSocket("wss://fstream.binance.com/market/ws/"+currentSymbol.toLowerCase()+"@aggTrade")'));
  assert.equal(futuresDesk.split("wss://fstream.binance.com/ws/").length - 1, 0, "do not use the retired generic Futures WebSocket URL");
  assert.match(futuresDesk, /function drawStructureAnnotations\(candles,currentAtr\)/);
  assert.match(futuresDesk, /Auto support/);
  assert.match(futuresDesk, /Auto resistance/);
  assert.match(futuresDesk, /Rising swing-low trendline/);
  assert.match(futuresDesk, /Falling swing-high trendline/);
  assert.match(futuresDesk, /mirrorSupportSeries/);
  assert.match(futuresDesk, /mirrorRisingTrendSeries/);
  assert.match(futuresDesk, /lastQuoteSource===marketVenue\+"-websocket"/);
  assert.match(source, /https:\/\/fapi\.binance\.com\/fapi\/v1\/klines/);
  assert.match(paperRoute, /https:\/\/fapi\.binance\.com\/fapi\/v1\/ticker\/price/);
});


test("live quote fallback uses the selected venue and blocks stale prices", () => {
  assert.match(liveQuoteRoute, /api\/v5\/market\/ticker/);
  assert.match(liveQuoteRoute, /new Set\(\["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT"\]\)/);
  assert.match(liveQuoteRoute, /ageMs > 3000/);
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


test("live last-trade tick updates the in-progress candle on the canonical chart", () => {
  assert.match(futuresDesk, /function syncLiveQuoteToCurrentCandle\(price,exchangeTimestamp,now=Date\.now\(\)\)/);
  assert.match(futuresDesk, /candleSeries\.update\(plotCandle\(bar\)\)/);
  assert.doesNotMatch(futuresDesk, /createChart\(\);createMirrorChart\(\)/);
  assert.match(futuresDesk, /priceLineVisible:false,lastValueVisible:false/);
  assert.match(futuresDesk, /function drawStrategyChart\(candles,symbol,interval,higherCandles=\[\],liveCandle=null\)/);
  assert.match(futuresDesk, /window\.tarotaiStrategyLiveCandle=liveCandle/);
  assert.match(futuresDesk, /drawStrategyChart\(candles,symbol,interval,higherCandles,liveCandle\)/);
  assert.match(futuresDesk, /liveP=Number\(window\.tarotaiSharedLastPrice\)/);
  assert.match(futuresDesk, /streamWasStale=Date\.now\(\)-lastMarketUpdateAt>5000/);
  assert.match(futuresDesk, /pollTimer=setInterval\(\(\)=>\{if\(document\.visibilityState==="visible"&&Date\.now\(\)-lastMarketUpdateAt>5000\)void refresh\(true\);\},5000\)/);
});

test("strategy signal calculations remain based on closed candles while displaying the active candle", () => {
  assert.match(futuresDesk, /const closes=candles\.map\(c=>c\.close\),fast=strategyEma\(closes,9\)/);
  assert.match(futuresDesk, /const view=data\.map/);
  assert.match(futuresDesk, /view\.push\(\{\.\.\.activeCandle,index:candles\.length,fast:visualFast/);
  assert.match(futuresDesk, /const last=candles\.length-1,prev=candles\[last-1\]/);
  assert.match(futuresDesk, /closedOnly\(rows,currentInterval\)/);
});


test("live chart preserves user panning/zooming instead of snapping back to the latest candle", () => {
  assert.match(futuresDesk, /id="liveGoLive"/);
  assert.match(futuresDesk, /let followLive=true,chartPointerStart=null/);
  assert.doesNotMatch(futuresDesk, /subscribeVisibleLogicalRangeChange\(range=>\{if\(range&&mirrorChart/);
  assert.match(futuresDesk, /function shouldStickToRealtime\(range,total\)\{return followLive&&\(!range\|\|range\.to>=total-8\);\}/);
  assert.match(futuresDesk, /function pauseLiveFollow\(\)\{if\(!followLive\)return;followLive=false;/);
  assert.match(futuresDesk, /host\.addEventListener\("wheel"/);
  assert.match(futuresDesk, /window\.addEventListener\("pointermove"/);
  assert.match(futuresDesk, /byId\("liveGoLive"\)\.addEventListener\("click",\(\)=>setLiveFollow\(true\)\)/);
  assert.doesNotMatch(futuresDesk, /stickAtRealtime=!visibleBefore\|\|visibleBefore\.to>=rows\.length-8/);
});

test("live chart resumes follow only on explicit Go Live, and symbol/timeframe changes reset safely", () => {
  assert.match(futuresDesk, /function setLiveFollow\(enabled\)\{followLive=Boolean\(enabled\)/);
  assert.match(futuresDesk, /if\(firstRender\|\|forceFit\).*followLive=true/s);
  assert.match(futuresDesk, /followLive=true;byId\("liveGoLive"\)\.hidden=true/);
  assert.match(futuresDesk, /attachChartNavigation\(byId\("liveMarketChart"\)\)/);
  assert.doesNotMatch(futuresDesk, /attachChartNavigation\(byId\("tvSyncedChart"\)\)/);
});


test("redundant visual strategy chart stays hidden and stops its polling loop", () => {
  assert.match(futuresDesk, /id="visual-strategy-panel" hidden/);
  assert.ok(futuresDesk.includes("if($('visual-strategy-panel')?.hidden)return"));
  assert.ok(futuresDesk.includes("!$('visual-strategy-panel')?.hidden&&!$('drawStrategy').disabled"));
});

test("all live overlays run on a single interactive chart, with external TradingView as an optional separate tab", () => {
  assert.match(futuresDesk, /id="liveMarketChart"/);
  assert.doesNotMatch(futuresDesk, /<div id="tvSyncedChart"/);
  assert.match(futuresDesk, /id="tvOpenExternal"/);
  assert.doesNotMatch(futuresDesk, /id="tradingview-panel"/);
  assert.match(futuresDesk, /id="visual-strategy-panel" hidden/);
  assert.match(futuresDesk, /attachChartNavigation\(byId\("liveMarketChart"\)\)/);
  assert.doesNotMatch(futuresDesk, /attachChartNavigation\(byId\("tvSyncedChart"\)\)/);
});


function makeScenarioFixture(count=260) {
  const candles=[];
  let previous=100;
  for(let i=0;i<count;i++){
    const close=100+i*0.035+Math.sin(i*0.47)*0.75+Math.sin(i*0.13)*0.25;
    const open=previous;
    const high=Math.max(open,close)+0.25+(i%7)*0.005;
    const low=Math.min(open,close)-0.25-(i%5)*0.005;
    candles.push({time:1700000000000+i*300000,open,high,low,close,volume:100+(i%19),closeTime:1700000000000+(i+1)*300000-1});
    previous=close;
  }
  return candles;
}

function makeBreakoutFixture(count=361){
  const candles=[];let previous=100;
  for(let i=0;i<count;i++){
    const step=Math.floor(i/40)*1.45;
    const close=100+i*0.025+Math.sin(i*0.47)*0.65+Math.sin(i*0.13)*0.2+step;
    const open=previous,volume=i%40===0?350:100+(i%9);
    candles.push({time:1700000000000+i*300000,open,high:Math.max(open,close)+0.12,low:Math.min(open,close)-0.12,close,volume,closeTime:1700000000000+(i+1)*300000-1});
    previous=close;
  }
  return candles;
}

test("directional scenario confirmation is withheld when higher-timeframe or relative-volume evidence is absent", () => {
  const candles=makeBreakoutFixture(361);
  const bullish=scenarioEngine.buildScenarioForecast(candles,{intervalMs:300000,higherTimeframeDirection:"BULLISH"});
  assert.equal(bullish.ready,true);
  assert.equal(bullish.candidateSignal,"LONG");
  assert.equal(bullish.signal,"LONG");
  assert.equal(bullish.volumeThreshold,1.1);
  assert.equal(bullish.volumeConfirmed,true);
  assert.equal(bullish.higherTimeframeAligned,true);
  const bearishContext=scenarioEngine.buildScenarioForecast(candles,{intervalMs:300000,higherTimeframeDirection:"BEARISH"});
  assert.equal(bearishContext.ready,true);
  assert.equal(bearishContext.candidateSignal,"LONG");
  assert.equal(bearishContext.signal,"NONE");
  assert.equal(bearishContext.higherTimeframeAligned,false);
  const flatVolume=candles.map(c=>({...c,volume:0}));
  const lowVolume=scenarioEngine.buildScenarioForecast(flatVolume,{intervalMs:300000,higherTimeframeDirection:"BULLISH"});
  assert.equal(lowVolume.ready,true);
  assert.equal(lowVolume.candidateSignal,"LONG");
  assert.equal(lowVolume.signal,"NONE");
  assert.equal(lowVolume.volumeConfirmed,false);
});

test("scenario forecast uses validated closed candles and returns two conditional chart paths", () => {
  const candles=makeScenarioFixture();
  const result=scenarioEngine.buildScenarioForecast(candles,{intervalMs:300000,symbol:"BTCUSDT",interval:"5m",higherTimeframeDirection:"BULLISH"});
  assert.equal(result.ready,true);
  assert.equal(result.symbol,"BTCUSDT");
  assert.equal(result.interval,"5m");
  assert.equal(result.basedOn,"closed OHLC candles only");
  assert.equal(result.scenarios.bull.projected.length,4);
  assert.equal(result.scenarios.bear.projected.length,4);
  assert.ok(result.scenarios.bull.target>result.close);
  assert.ok(result.scenarios.bull.invalidation<result.close);
  assert.ok(result.scenarios.bear.target<result.close);
  assert.ok(result.scenarios.bear.invalidation>result.close);
  assert.ok(result.longScore>=0&&result.longScore<=5);
  assert.ok(result.shortScore>=0&&result.shortScore<=5);
  assert.match(result.note,/not calibrated probabilities/);
});

test("scenario engine fails closed on inadequate, invalid, duplicate or unordered candle history", () => {
  assert.equal(scenarioEngine.buildScenarioForecast([], {intervalMs:300000}).ready,false);
  const broken=makeScenarioFixture(100);
  broken[90]={...broken[90],low:broken[90].high+1};
  assert.equal(scenarioEngine.buildScenarioForecast(broken,{intervalMs:300000}).ready,false);
  const unordered=makeScenarioFixture(100);[unordered[30],unordered[31]]=[unordered[31],unordered[30]];
  assert.equal(scenarioEngine.buildScenarioForecast(unordered,{intervalMs:300000}).ready,false);
  const duplicate=makeScenarioFixture(100);duplicate[51]={...duplicate[51],time:duplicate[50].time};
  assert.equal(scenarioEngine.backtestScenarioForecast(duplicate).ready,false);
  const coerced=makeScenarioFixture(100);coerced[99]={...coerced[99],close:String(coerced[99].close)};
  assert.equal(scenarioEngine.buildScenarioForecast(coerced,{intervalMs:300000}).ready,false);
  const openBar=makeScenarioFixture(100);openBar[99]={...openBar[99],closeTime:Date.now()+60000};
  assert.equal(scenarioEngine.buildScenarioForecast(openBar,{intervalMs:300000}).ready,false);
  assert.equal(scenarioEngine.backtestScenarioForecast(makeScenarioFixture(80)).ready,false);
});

function makeHigherScenarioFixture(mainCandles,count=180){
  const intervalMs=3600000, lastMain=mainCandles[mainCandles.length-1];
  const lastCompletedBucket=Math.floor((lastMain.closeTime+1)/intervalMs)*intervalMs-intervalMs;
  const candles=[];let previous=80;
  for(let i=0;i<count;i++){
    const time=lastCompletedBucket-(count-i-1)*intervalMs;
    const close=80+i*0.15+Math.sin(i*0.17)*0.4;
    const open=previous;
    candles.push({time,open,high:Math.max(open,close)+0.4,low:Math.min(open,close)-0.4,close,volume:500+i*2,closeTime:time+intervalMs-1});
    previous=close;
  }
  return candles;
}

test("walk-forward replay is bounded and uses higher-timeframe and volume gates", () => {
  const candles=makeBreakoutFixture(361);
  const higherTimeframeCandles=makeHigherScenarioFixture(candles);
  const result=scenarioEngine.backtestScenarioForecast(candles,{
    horizon:3,intervalMs:300000,higherTimeframeCandles,higherTimeframeIntervalMs:3600000
  });
  assert.equal(result.ready,true);
  assert.ok(result.candlesUsed<=1200);
  assert.equal(result.higherTimeframeCandlesUsed,180);
  assert.ok(result.signals>0);
  assert.ok(result.resolved>0);
  assert.ok(result.signals<=120);
  assert.equal(result.signals,result.targetFirst+result.stopFirst+result.timeouts);
  if(result.targetBeforeStopPct!==null)assert.ok(result.targetBeforeStopPct>=0&&result.targetBeforeStopPct<=100);
  if(result.targetOfAllSignalsPct!==null)assert.ok(result.targetOfAllSignalsPct>=0&&result.targetOfAllSignalsPct<=100);
  assert.match(result.caveat,/same volume and higher-timeframe confirmation gates/);
  const withoutHigherTimeframe=scenarioEngine.backtestScenarioForecast(candles,{horizon:3,intervalMs:300000});
  assert.equal(withoutHigherTimeframe.ready,false);
  assert.match(withoutHigherTimeframe.reason,/higher-timeframe history is required/);
});

test("live chart forecast and auto discussion remain visible, safe and automatic", () => {
  assert.match(futuresDesk, /<script src="\/trading-scenarios\.js"><\/script>/);
  assert.match(futuresDesk, /id="scenarioForecastPanel"/);
  assert.match(futuresDesk, /bullForecastSeries=chart\.addLineSeries/);
  assert.match(futuresDesk, /bearForecastSeries=chart\.addLineSeries/);
  assert.match(futuresDesk, /renderScenarioForecast\(closed,htf,staleness\)/);
  assert.ok(futuresDesk.includes('const higherMap={"1m":"15m","3m":"15m","5m":"1h","15m":"4h","30m":"4h","1h":"1d","2h":"1d","4h":"1d","1d":"1d"}'));
  assert.ok(futuresDesk.includes("Walk-forward replay (HTF trend + relative-volume gates)"));
  assert.match(futuresDesk, /backtestScenarioForecast\(candles,\{horizon:3,intervalMs:msFor\(currentInterval\),higherTimeframeCandles:higherCache,higherTimeframeIntervalMs:msFor\(higherMap\[currentInterval\]\|\|"1d"\)\}\)/);
  assert.match(futuresDesk, /id="autoAgentDiscussionLog"/);
  assert.match(futuresDesk, /function updateAutoAgentDiscussion\(context\)/);
  assert.match(futuresDesk, /function maybeRunAutomaticAiReview\(context\)/);
  assert.match(futuresDesk, /key===lastAutomaticAiReviewKey/);
  assert.match(futuresDesk, /runLiveAgentTeam\(\{automatic:true\}\)/);
  assert.match(futuresDesk, /appendAiReviewToDiscussion\(data\.results/);
  assert.match(futuresDesk, /Supervisor vetoes and provider fallbacks block AI approval/);
  assert.match(futuresDesk, /textContent=message\.text/);
});

test("live quote EMA updates are incremental and avoid full-history setData per tick", () => {
  assert.match(futuresDesk, /function rebuildEmaSeries\(anchorIndex\)/);
  assert.match(futuresDesk, /function updateActiveEma\(bar\)/);
  assert.match(futuresDesk, /ema9Series\.update\(\{time,value:close\*\(2\/10\)\+emaAnchor\.e9\*\(8\/10\)\}\)/);
  const start=futuresDesk.indexOf("function syncLiveQuoteToCurrentCandle");
  const end=futuresDesk.indexOf("function renderSharedQuote",start);
  assert.ok(start>=0&&end>start);
  assert.doesNotMatch(futuresDesk.slice(start,end), /ema9Series\.setData/);
  assert.match(futuresDesk, /if\(isClosed\)rebuildEmaSeries\(rows\.length-1\);else updateActiveEma\(bar\)/);
  assert.match(futuresDesk, /if\(isClosed\)\{analyze\(\);runContinuousAgentCycle\(\);\}/);
});

test("user chart viewport is restored after candle and forecast data updates", () => {
  assert.match(futuresDesk, /else if\(rangeBefore\)\{try\{chart\.timeScale\(\)\.setVisibleLogicalRange\(rangeBefore\)/);
  assert.match(futuresDesk, /if\(chart&&!followLive&&rangeBefore\)chart\.timeScale\(\)\.setVisibleLogicalRange\(rangeBefore\)/);
  assert.match(futuresDesk, /Math\.abs\(event\.clientX-start\.x\)>2\|\|Math\.abs\(event\.clientY-start\.y\)>2/);
  assert.match(futuresDesk, /byId\("liveGoLive"\)\.addEventListener\("click",\(\)=>setLiveFollow\(true\)\)/);
  assert.match(futuresDesk, /One synchronized interactive chart is shown in this desk/);
});


test("Futures Lab restores order-flow bubbles on the existing candlestick chart", () => {
  assert.equal((tradingDeskPage.match(/id="liveMarketChart"/g) || []).length, 1, "there is one primary candlestick chart");
  assert.equal((tradingDeskPage.match(/id="orderflowHeatmapCanvas"/g) || []).length, 1, "flow is an overlay, not a second chart");
  assert.ok(tradingDeskPage.includes('id="toggleOrderflowOverlay"'), "overlay can be toggled by the user");
  assert.ok(tradingDeskPage.includes("function drawOrderflowOverlay()"), "live order-flow renderer exists");
  assert.ok(tradingDeskPage.includes("candleSeries.priceToCoordinate"), "depth levels and executed trades map to chart price coordinates");
  assert.ok(tradingDeskPage.includes("chart.timeScale().timeToCoordinate"), "executed trades map to candle time coordinates");
  assert.ok(tradingDeskPage.includes('document.addEventListener("tarotai:orderflow-update"'), "chart consumes the live depth/trade feed");
  assert.ok(orderflowPanelScript.includes("function scheduleRender()"), "websocket updates call a defined throttled renderer");
  assert.ok(orderflowPanelScript.includes('new CustomEvent("tarotai:orderflow-update"'), "panel publishes flow data to the chart");
  assert.ok(orderflowPanelScript.includes("price, qty, quote:"), "executed trades preserve actual price and quantity");
  assert.ok(orderflowPanelScript.includes("wss://fstream.binance.com/public/stream?streams="), "book uses the Futures public depth stream");
  assert.ok(orderflowPanelScript.includes("wss://fstream.binance.com/market/stream?streams="), "trades use the Futures market aggregate-trade stream");
});
