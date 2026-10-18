import test from "node:test";
import assert from "node:assert/strict";
import { evaluateLiveExecutionReadiness } from "../lib/live-execution-safety.mjs";

const env = {
  TAROTAI_LIVE_TRADING_ENABLED: "true",
  TAROTAI_LIVE_TRADING_ARMED: "true",
  TAROTAI_LIVE_TRADING_KILL_SWITCH: "false",
  BINANCE_LIVE_API_KEY: "live-key",
  BINANCE_LIVE_API_SECRET: "live-secret",
  BINANCE_TESTNET_API_KEY: "demo-key"
};
const agents = ["market","entry","exits","sizing","discipline","position","journal","supervisor"].map(role => ({role,ok:true,bias:"LONG",fallback:false,veto:false}));
const account = {equity:10000,availableBalance:9000,dailyRealizedPnl:0};
const market = {marketDataAgeMs:500,orderBookAgeMs:500,spreadBps:1};
const order = {side:"BUY",quantity:0.1,entry:100,stop:99,target:102,riskPct:0.1,leverage:1};
const stopLoss = {exchangeConfirmed:true,reduceOnly:true,closePosition:true};
const ready = (overrides={}) => evaluateLiveExecutionReadiness({env,account,market,agents,order,stopLoss,duplicate:false,...overrides});

test("fails closed by default and never enables orders", () => {
  const result = evaluateLiveExecutionReadiness({});
  assert.equal(result.approved,false);
  assert.equal(result.status,"BLOCKED");
  assert.equal(result.liveOrdersEnabled,false);
  assert.ok(result.blockers.length > 0);
});

test("accepts only fully verified inputs as readiness, never as execution", () => {
  const result = ready();
  assert.equal(result.approved,true);
  assert.equal(result.liveOrdersEnabled,false);
});

test("global emergency stop blocks readiness", () => {
  const result = ready({env:{...env,TAROTAI_LIVE_TRADING_KILL_SWITCH:"true"}});
  assert.equal(result.approved,false);
  assert.ok(result.blockers.some(x=>x.includes("emergency stop")));
});

test("blocks stale data, failed agent, duplicate, and unconfirmed stop", () => {
  assert.equal(ready({market:{...market,marketDataAgeMs:5001}}).approved,false);
  assert.equal(ready({agents:agents.map((a,i)=>i===0?{...a,ok:false}:a)}).approved,false);
  assert.equal(ready({duplicate:true}).approved,false);
  assert.equal(ready({stopLoss:{exchangeConfirmed:false,reduceOnly:true,closePosition:true}}).approved,false);
});

test("caps risk, leverage, notional, and daily loss", () => {
  assert.equal(ready({order:{...order,riskPct:0.5}}).approved,false);
  assert.equal(ready({order:{...order,leverage:3}}).approved,false);
  assert.equal(ready({order:{...order,quantity:200}}).approved,false);
  assert.equal(ready({account:{...account,dailyRealizedPnl:-101}}).approved,false);
});

test("blocks non-unanimous agent decisions and invalid stop geometry", () => {
  assert.equal(ready({agents:agents.map((a,i)=>i===1?{...a,bias:"SHORT"}:a)}).approved,false);
  assert.equal(ready({order:{...order,stop:101}}).approved,false);
});
