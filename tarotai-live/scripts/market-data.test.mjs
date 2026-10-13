import test from "node:test";
import assert from "node:assert/strict";
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
  assert.match(futuresDesk, /id="liveAgentPanel" hidden/);
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
  assert.match(futuresDesk, /Paper entry blocked: run the full eight-agent trading team/);
  assert.match(futuresDesk, /Select all eight distinct agents/);
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
  assert.match(parallelAgentsRoute,/role==="sizing"&&!vetoDeclared\?true:parsedVote\.veto/);
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
  assert.match(parallelAgentsRoute,/roles\.filter\(\(role:string\)=>role!=="supervisor"\)/);\n  assert.match(parallelAgentsRoute,/Agent Operations Supervisor/);
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
  assert.match(futuresDesk, /if\(stickAtRealtime\)chart\.timeScale\(\)\.scrollToRealTime\(\)/);
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
