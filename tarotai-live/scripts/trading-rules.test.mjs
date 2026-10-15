import test from "node:test";
import assert from "node:assert/strict";
import {applySlippage,calculateFee,isStale,validateStops,resolveStopTarget,resolveTargetOnlyObservation,validateOrderRequest,calculatePaperQuantity,validatePaperExposure,validatePaperDailyRisk,PAPER_MAX_POSITION_EXPOSURE_PCT,PAPER_MAX_PORTFOLIO_EXPOSURE_PCT,PAPER_MAX_DAILY_LOSS_PCT,PAPER_MAX_ENTRIES_PER_UTC_DAY} from "../lib/trading-rules.mjs";
import { evaluateLiveAgentSignal, runLiveAgentStrategyBacktest } from "../lib/live-agent-backtest.mjs";
import strategyEnsemble from "../public/strategy-ensemble.js";
const { evaluateStrategyEnsemble } = strategyEnsemble;
test("autonomous paper daily safety limits remain explicit",()=>{
 assert.equal(PAPER_MAX_DAILY_LOSS_PCT,3);
 assert.equal(PAPER_MAX_ENTRIES_PER_UTC_DAY,5);
});
test("paper daily loss guard blocks entries at the realized-loss limit",()=>{
 const now=Date.UTC(2026,9,15,12),today=new Date(now-60_000).toISOString();
 const ledger=[
  {id:"entry-1",status:"PAPER_OPEN",createdAt:today},
  {id:"close-1",parentTradeId:"entry-1",status:"PAPER_STOP",pnlNet:-300,createdAt:today}
 ];
 assert.match(validatePaperDailyRisk({ledger,balance:10000,now}),/Daily paper loss limit/);
});
test("paper daily entry guard counts five entries even after they are closed",()=>{
 const now=Date.UTC(2026,9,15,12),today=new Date(now-60_000).toISOString();
 const ledger=Array.from({length:5},(_,i)=>({id:"entry-"+i,status:"PAPER_OPEN",createdAt:today}));
 assert.match(validatePaperDailyRisk({ledger,balance:10000,now}),/Daily paper entry limit/);
});
test("paper daily risk guard does not carry prior-UTC-day losses into today",()=>{
 const now=Date.UTC(2026,9,15,12),yesterday=new Date(now-86400000).toISOString();
 const ledger=[
  {id:"entry-1",status:"PAPER_OPEN",createdAt:yesterday},
  {id:"close-1",parentTradeId:"entry-1",status:"PAPER_STOP",pnlNet:-400,createdAt:yesterday}
 ];
 assert.equal(validatePaperDailyRisk({ledger,balance:10000,now}),null);
});

test("paper position sizing caps notional at 5% while respecting stop-risk budget",()=>{
 assert.equal(PAPER_MAX_POSITION_EXPOSURE_PCT,5);
 assert.equal(PAPER_MAX_PORTFOLIO_EXPOSURE_PCT,20);
 const quantity=calculatePaperQuantity({balance:1000,riskPct:0.5,entry:100,stop:90});
 assert.equal(quantity,0.5);
 assert.ok(quantity*100<=1000*0.05);
 assert.ok(quantity*Math.abs(100-90)<=1000*0.005+1e-8);
});

test("paper exposure checker rejects excessive per-position notional",()=>{
 assert.match(validatePaperExposure({balance:10000,riskPct:0.5,entry:100,stop:95,quantity:6,existingExposure:0}),/5% per-position exposure cap/);
});

test("paper exposure checker rejects stop risk that exceeds configured risk budget",()=>{
 assert.match(validatePaperExposure({balance:10000,riskPct:0.1,entry:100,stop:90,quantity:2,existingExposure:0}),/stop-distance risk exceeds/);
});

test("paper exposure checker rejects aggregate portfolio notional above 20%",()=>{
 assert.match(validatePaperExposure({balance:10000,riskPct:0.5,entry:100,stop:95,quantity:5,existingExposure:1800}),/20% portfolio cap/);
});

test("paper exposure checker permits a correctly risk-sized capped position",()=>{
 assert.equal(validatePaperExposure({balance:10000,riskPct:0.5,entry:100,stop:95,quantity:5,existingExposure:1000}),null);
});

test("paper position sizing rejects invalid balance, risk or geometry",()=>{
 assert.throws(()=>calculatePaperQuantity({balance:0,riskPct:0.5,entry:100,stop:90}),/invalid paper sizing inputs/);
 assert.throws(()=>calculatePaperQuantity({balance:10000,riskPct:2,entry:100,stop:90}),/invalid paper sizing inputs/);
 assert.throws(()=>calculatePaperQuantity({balance:10000,riskPct:0.5,entry:100,stop:100}),/invalid paper sizing inputs/);
});

test("buy slippage worsens fill and sell slippage worsens fill",()=>{assert.equal(applySlippage("BUY",100,10),100.1);assert.equal(applySlippage("SELL",100,10),99.9)});
test("fees are charged from fill notional",()=>{assert.equal(calculateFee(100,2,10),0.2)});
test("stale data is rejected, fresh data accepted",()=>{assert.equal(isStale(1000,61001,60000),true);assert.equal(isStale(2000,61001,60000),false);assert.equal(isStale(NaN,61001,60000),true)});
test("stop geometry follows side",()=>{assert.equal(validateStops("LONG",100,95,110),true);assert.equal(validateStops("LONG",100,105,110),false);assert.equal(validateStops("SHORT",100,105,90),true)});
test("stop wins if stop and target both hit in one candle",()=>{const result=resolveStopTarget({open:100,high:112,low:94},"LONG",95,110);assert.equal(result.exit,"STOP");assert.equal(result.ambiguous,true)});
test("target-only observation ignores a stop touch and waits for profit target",()=>{
 const stoppedOnly=resolveTargetOnlyObservation({open:100,high:104,low:94},"LONG",95,110);
 assert.equal(stoppedOnly.exit,null);
 assert.equal(stoppedOnly.stopTouched,true);
 assert.equal(stoppedOnly.targetTouched,false);
 const targetOnly=resolveTargetOnlyObservation({open:106,high:111,low:101},"LONG",95,110);
 assert.equal(targetOnly.exit,"TARGET");
 assert.equal(targetOnly.price,110);
 assert.equal(targetOnly.stopTouched,false);
});
test("target-only observation stays open when stop and target touch in the same candle",()=>{
 const result=resolveTargetOnlyObservation({open:100,high:112,low:94},"LONG",95,110);
 assert.equal(result.exit,null);
 assert.equal(result.ambiguous,true);
 assert.equal(result.stopTouched,true);
 assert.equal(result.targetTouched,true);
});
test("target-only observation supports short-side target hits without stop-outs",()=>{
 const stoppedOnly=resolveTargetOnlyObservation({open:100,high:106,low:98},"SHORT",105,90);
 assert.equal(stoppedOnly.exit,null);
 assert.equal(stoppedOnly.stopTouched,true);
 const targetOnly=resolveTargetOnlyObservation({open:94,high:102,low:89},"SHORT",105,90);
 assert.equal(targetOnly.exit,"TARGET");
 assert.equal(targetOnly.price,90);
});
test("gap through a long stop exits at worse opening price",()=>{const result=resolveStopTarget({open:90,high:105,low:88},"LONG",95,110);assert.equal(result.price,90)});
test("invalid fees and fill inputs are rejected",()=>{assert.throws(()=>applySlippage("BUY",100,999));assert.throws(()=>calculateFee(100,0,5))});

test("invalid orders are rejected before exchange submission",()=>{
 assert.equal(validateOrderRequest({symbol:"BTCUSDT",side:"HOLD",type:"MARKET",quantity:1,clientOrderId:"t123"}),"invalid side");
 assert.equal(validateOrderRequest({symbol:"BTCUSDT",side:"BUY",type:"LIMIT",quantity:1,price:0,clientOrderId:"t123"}),"invalid limit price");
 assert.equal(validateOrderRequest({symbol:"BTCUSDT",side:"SELL",type:"MARKET",quantity:0,clientOrderId:"t123"}),"invalid quantity");
 assert.equal(validateOrderRequest({symbol:"BTCUSDT",side:"BUY",type:"MARKET",quantity:1,clientOrderId:"",venue:"binance"}),"invalid client order ID");
 assert.equal(validateOrderRequest({symbol:"BTCUSDT",side:"BUY",type:"MARKET",quantity:1,clientOrderId:"t123"}),null);
});

import { calculateSma, runSmaCrossoverBacktest, validateBacktestCandles } from "../lib/trading-backtest.mjs";

function sampleBacktestCandles() {
 const closes=[3,2,1,2,3,4,2,1,0.5,1,0.8,0.6,0.9,1.2,1.5,1.8,1.3,0.8,0.6,0.4,0.7,1.0];
 return closes.map((close,i)=>{const open=close+0.2;return {time:1_700_000_000_000+i*300_000,open,high:Math.max(open,close)+0.1,low:Math.min(open,close)-0.1,close,volume:10,closeTime:1_700_000_000_000+(i+1)*300_000-1};});
}

test("SMA uses only values available at or before each candle",()=>{
 assert.deepEqual(calculateSma([1,2,3,4],3),[null,null,2,3]);
});

test("backtest enters on the next candle open after a closed-bar crossover",()=>{
 const candles=sampleBacktestCandles();
 const result=runSmaCrossoverBacktest(candles,{fastPeriod:2,slowPeriod:3,feeBps:0,slippageBps:2});
 const firstLong=result.recentTrades.find(t=>t.side==="LONG");
 assert.ok(firstLong,"expected a long crossover trade");
 assert.equal(firstLong.entryTime,candles[5].time);
 assert.ok(Math.abs(firstLong.entryPrice-candles[5].open*1.0002)<1e-10);
 assert.notEqual(firstLong.entryPrice,candles[4].close,"must not fill at the signal candle's close");
 assert.ok(Array.isArray(result.equityCurve));
});

test("fees and adverse slippage do not improve the same SMA backtest",()=>{
 const candles=sampleBacktestCandles();
 const free=runSmaCrossoverBacktest(candles,{fastPeriod:2,slowPeriod:3,feeBps:0,slippageBps:0});
 const afterCosts=runSmaCrossoverBacktest(candles,{fastPeriod:2,slowPeriod:3,feeBps:5,slippageBps:2});
 assert.ok(afterCosts.netReturnPct<=free.netReturnPct);
 assert.ok(afterCosts.buyHoldReturnPct<free.buyHoldReturnPct);
});

test("backtest rejects malformed or unordered OHLC candles",()=>{
 const candles=sampleBacktestCandles();
 assert.equal(validateBacktestCandles(candles),true);
 assert.throws(()=>validateBacktestCandles([candles[0],{...candles[1],high:0.5},candles[2]]),/Malformed OHLC/);
 assert.throws(()=>validateBacktestCandles([candles[1],candles[0],candles[2]]),/strictly chronological/);
});

test("backtest rejects impossible periods and excessive cost inputs",()=>{
 const candles=sampleBacktestCandles();
 assert.throws(()=>runSmaCrossoverBacktest(candles,{fastPeriod:3,slowPeriod:2}),/Require integer periods/);
 assert.throws(()=>runSmaCrossoverBacktest(candles,{fastPeriod:2,slowPeriod:3,feeBps:51}),/between 0 and 50/);
});


import { readFileSync } from "node:fs";

test("trading agent prompt requires evidence-based plugin use and protects execution boundaries", () => {
 const prompt = readFileSync(new URL("../lib/trading-agent.ts", import.meta.url), "utf8");
 assert.match(prompt, /consult the connected LONA strategy documentation first/i);
 assert.match(prompt, /If rejected, blocked, pending, or failed, disclose that no result was obtained/i);
 assert.match(prompt, /chronological holdout/i);
 assert.match(prompt, /Do not execute arbitrary strategy code in a dry-run\/backtest tool unless the user has explicitly approved/i);
 assert.match(prompt, /Never place live-money orders/i);
 assert.match(prompt, /Do not claim model weights were trained/i);
});


function syntheticLiveCandles(count=320,intervalMs=300000){
 const first=1_700_000_000_000,rows=[];
 for(let i=0;i<count;i++){
  const close=100+i*.03+.6*Math.sin(i*2*Math.PI/18)+.05*Math.sin(i*.83);
  const open=i===0?close-.04:rows[i-1].close;
  rows.push({time:first+i*intervalMs,open,high:Math.max(open,close)+.04,low:Math.min(open,close)-.04,close,volume:100,closeTime:first+(i+1)*intervalMs-1});
 }
 return rows;
}
function syntheticHigherCandles(mainStart,count=240,intervalMs=3600000){
 const first=mainStart-count*intervalMs,rows=[];
 for(let i=0;i<count;i++){
  const close=75+i*.08+.18*Math.sin(i*.43),open=i===0?close-.03:rows[i-1].close;
  rows.push({time:first+i*intervalMs,open,high:Math.max(open,close)+.06,low:Math.min(open,close)-.06,close,volume:100,closeTime:first+(i+1)*intervalMs-1});
 }
 return rows;
}
function findQualifiedLiveSignal(main,higher,start=MIN_LIVE_WARMUP){
 for(let i=start;i<main.length-1;i++){const out=evaluateLiveAgentSignal(main,higher,i);if(out.signal)return {index:i,...out.signal};}
 return null;
}
const MIN_LIVE_WARMUP=79;

test("live-agent backtest emits only a closed-candle breakout with a previously closed higher-timeframe trend",()=>{
 const main=syntheticLiveCandles(),higher=syntheticHigherCandles(main[0].time);
 const candidate=findQualifiedLiveSignal(main,higher);
 assert.ok(candidate,"synthetic history should include a deterministic qualified setup");
 assert.ok(candidate.signalTime<candidate.signalCloseTime+1);
 assert.ok(candidate.higherCandleTime<=candidate.signalCloseTime);
 assert.ok(candidate.longScore>=4||candidate.shortScore>=4);
 if(candidate.side==="LONG"){assert.ok(candidate.stop<candidate.entryReference);assert.ok(candidate.target>candidate.entryReference);assert.equal(candidate.higherTrend,"BULLISH");}
 else {assert.ok(candidate.target<candidate.entryReference);assert.ok(candidate.stop>candidate.entryReference);assert.equal(candidate.higherTrend,"BEARISH");}
});

test("live-agent signal cannot leak a higher-timeframe candle that closes after the signal candle",()=>{
 const main=syntheticLiveCandles(),higher=syntheticHigherCandles(main[0].time);
 const candidate=findQualifiedLiveSignal(main,higher);
 assert.ok(candidate,"fixture needs a signal to test higher-timeframe timing");
 const baseline=evaluateLiveAgentSignal(main,higher,candidate.index);
 const futureOnly=higher.map(c=>c.closeTime>main[candidate.index].closeTime?{...c,open:1,high:2,low:.5,close:1,volume:100}:c);
 const afterFutureChange=evaluateLiveAgentSignal(main,futureOnly,candidate.index);
 assert.deepEqual(afterFutureChange,baseline);
});

test("live-agent backtest enters at the next candle open and resolves ambiguous stop/target candles conservatively",()=>{
 const main=syntheticLiveCandles(),higher=syntheticHigherCandles(main[0].time);
 const candidate=findQualifiedLiveSignal(main,higher);
 assert.ok(candidate,"fixture needs a qualified setup");
 const mutated=main.map(c=>({...c}));
 const entryBar=mutated[candidate.index+1],entryOpen=mutated[candidate.index].close;
 const risk=Math.abs(entryOpen-candidate.stop),target=candidate.side==="LONG"?entryOpen+2*risk:entryOpen-2*risk;
 entryBar.open=entryOpen;entryBar.close=entryOpen;
 entryBar.high=Math.max(entryOpen,target)+.3;
 entryBar.low=Math.min(entryOpen,candidate.stop)-.3;
 const result=runLiveAgentStrategyBacktest(mutated,higher,{fromIndex:candidate.index,endIndex:candidate.index+2,signalStartIndex:candidate.index,intervalMs:300000});
 assert.equal(result.closedTrades,1);
 assert.equal(result.recentTrades[0].signalTime,mutated[candidate.index].time);
 assert.equal(result.recentTrades[0].entryTime,mutated[candidate.index+1].time);
 assert.equal(result.recentTrades[0].exitReason,"STOP_AMBIGUOUS");
 assert.equal(result.ambiguousStopFirstExits,1);
 assert.equal(result.stopExits,1);
 assert.equal(result.targetExits,0);
 assert.equal(result.windowEndCloses,0);
 assert.ok(result.recentTrades[0].netPnl<0);
});

test("live-agent backtest refuses to chase a next-bar open more than one percent from the signal close",()=>{
 const main=syntheticLiveCandles(),higher=syntheticHigherCandles(main[0].time);
 const candidate=findQualifiedLiveSignal(main,higher);
 assert.ok(candidate,"fixture needs a qualified setup");
 const mutated=main.map(c=>({...c})),bar=mutated[candidate.index+1];
 const jumpedOpen=candidate.side==="LONG"?candidate.entryReference*1.02:candidate.entryReference*.98;
 bar.open=jumpedOpen;bar.close=jumpedOpen;bar.high=jumpedOpen+.05;bar.low=Math.max(.01,jumpedOpen-.05);
 const result=runLiveAgentStrategyBacktest(mutated,higher,{fromIndex:candidate.index,endIndex:candidate.index+2,signalStartIndex:candidate.index,intervalMs:300000});
 assert.equal(result.closedTrades,0);
 assert.equal(result.skippedEntryDrift,1);
});

test("live-agent backtest keeps train and holdout trades in their own chronological segments",()=>{
 const main=syntheticLiveCandles(520),higher=syntheticHigherCandles(main[0].time);
 const split=364;
 const train=runLiveAgentStrategyBacktest(main,higher,{fromIndex:79,endIndex:split,signalStartIndex:79,intervalMs:300000});
 const holdout=runLiveAgentStrategyBacktest(main,higher,{fromIndex:split,endIndex:main.length,signalStartIndex:split,intervalMs:300000});
 assert.ok(train.recentTrades.every(t=>t.signalTime<main[split].time));
 assert.ok(holdout.recentTrades.every(t=>t.signalTime>=main[split].time));
 assert.ok(holdout.recentTrades.every(t=>t.entryTime>t.signalTime));
 assert.equal(train.assumptions.lookahead.includes("only candles closed by then"),true);
});


test("live-agent backtest records a target hit separately from a window-end close",()=>{
 const main=syntheticLiveCandles(),higher=syntheticHigherCandles(main[0].time);
 const candidate=findQualifiedLiveSignal(main,higher);
 assert.ok(candidate,"fixture needs a qualified setup");
 const mutated=main.map(c=>({...c})),bar=mutated[candidate.index+1],entry=mutated[candidate.index].close;
 const long=candidate.side==="LONG",risk=Math.abs(entry-candidate.stop),target=long?entry+2*risk:entry-2*risk;
 bar.open=entry;bar.close=entry;
 bar.high=long?target+.2:Math.min(candidate.stop-.05,entry+.05);
 bar.low=long?Math.max(candidate.stop+.05,entry-.05):target-.2;
 const result=runLiveAgentStrategyBacktest(mutated,higher,{fromIndex:candidate.index,endIndex:candidate.index+2,signalStartIndex:candidate.index});
 assert.equal(result.closedTrades,1);
 assert.equal(result.targetExits,1);
 assert.equal(result.stopExits,0);
 assert.equal(result.windowEndCloses,0);
 assert.equal(result.recentTrades[0].exitReason,"TARGET");
 assert.ok(result.recentTrades[0].netPnl>0);
 assert.ok(Number.isFinite(result.recentTrades[0].exitPrice));
});

test("live-agent backtest models gap-through-stop exits at the adverse opening price",()=>{
 const main=syntheticLiveCandles(),higher=syntheticHigherCandles(main[0].time);
 const candidate=findQualifiedLiveSignal(main,higher);
 assert.ok(candidate,"fixture needs a qualified setup");
 const mutated=main.map(c=>({...c})),entryBar=mutated[candidate.index+1],entry=mutated[candidate.index].close,long=candidate.side==="LONG";
 entryBar.open=entry;entryBar.close=entry;entryBar.high=entry+.05;entryBar.low=entry-.05;
 const gapBar=mutated[candidate.index+2],gapOpen=long?candidate.stop-.2:candidate.stop+.2;
 gapBar.open=gapOpen;gapBar.close=gapOpen;gapBar.high=long?gapOpen+.05:gapOpen+.2;gapBar.low=long?gapOpen-.2:gapOpen-.05;
 const result=runLiveAgentStrategyBacktest(mutated,higher,{fromIndex:candidate.index,endIndex:candidate.index+3,signalStartIndex:candidate.index});
 assert.equal(result.closedTrades,1);
 assert.equal(result.recentTrades[0].exitReason,"GAP_STOP");
 assert.equal(result.stopExits,1);
 if(long)assert.ok(result.recentTrades[0].exitPrice<candidate.stop);
 else assert.ok(result.recentTrades[0].exitPrice>candidate.stop);
});

test("live-agent backtest validates non-finite segment indices and market volume",()=>{
 const main=syntheticLiveCandles(),higher=syntheticHigherCandles(main[0].time);
 assert.throws(()=>runLiveAgentStrategyBacktest(main,higher,{fromIndex:NaN}),/Invalid chronological segment indices/);
 const bad=main.map(c=>({...c}));bad[90].volume=NaN;
 assert.throws(()=>evaluateLiveAgentSignal(bad,higher,100),/finite non-negative volume/);
});

function syntheticEnsembleCandles(count, mode="up") {
 const first=1_700_000_000_000, rows=[];
 for(let i=0;i<count;i++){
  const close=mode==="up"?100+i*0.2:mode==="down"?140-i*0.2:100+0.05*Math.sin(i*0.7);
  const open=i===0?close-0.03:rows[i-1].close;
  rows.push({time:first+i*300_000,open,high:Math.max(open,close)+0.04,low:Math.min(open,close)-0.04,close,volume:100});
 }
 return rows;
}

test("shadow strategy ensemble requires valid closed-candle history",()=>{
 const short=evaluateStrategyEnsemble({candles:syntheticEnsembleCandles(40),higherTrend:"BULLISH"});
 assert.equal(short.status,"WAIT");
 assert.equal(short.bias,"WAIT");
 assert.match(short.message,/80 closed candles/);
 const stale=evaluateStrategyEnsemble({candles:syntheticEnsembleCandles(100),higherTrend:"BULLISH",fresh:false});
 assert.equal(stale.bias,"WAIT");
 assert.match(stale.message,/Stale or unsupported/);
});

test("shadow ensemble needs two unopposed strategy votes before suggesting a direction",()=>{
 const long=evaluateStrategyEnsemble({candles:syntheticEnsembleCandles(120,"up"),higherTrend:"BULLISH"});
 assert.equal(long.status,"READY");
 assert.equal(long.bias,"LONG");
 assert.ok(long.longVotes>=2);
 assert.equal(long.shortVotes,0);
 assert.equal(long.isProbability,false);
 assert.match(long.message,/rule agreement, not a probability estimate/);
 const short=evaluateStrategyEnsemble({candles:syntheticEnsembleCandles(120,"down"),higherTrend:"BEARISH"});
 assert.equal(short.bias,"SHORT");
 assert.ok(short.shortVotes>=2);
 assert.equal(short.longVotes,0);
});

test("shadow ensemble does not manufacture a trend vote without higher-timeframe confirmation",()=>{
 const result=evaluateStrategyEnsemble({candles:syntheticEnsembleCandles(120,"up"),higherTrend:"UNAVAILABLE"});
 assert.equal(result.strategies.trend.bias,"WAIT");
 assert.equal(result.bias,"WAIT");
});

test("shadow ensemble rejects malformed or unordered candle inputs",()=>{
 const candles=syntheticEnsembleCandles(100);
 assert.equal(evaluateStrategyEnsemble({candles,higherTrend:"BULLISH"}).status,"READY");
 const bad=candles.map(c=>({...c}));bad[50].high=bad[50].low-1;
 assert.equal(evaluateStrategyEnsemble({candles:bad,higherTrend:"BULLISH"}).bias,"WAIT");
 const unordered=candles.map(c=>({...c}));[unordered[20].time,unordered[21].time]=[unordered[21].time,unordered[20].time];
 assert.equal(evaluateStrategyEnsemble({candles:unordered,higherTrend:"BULLISH"}).status,"WAIT");
});

test("ensemble is wired into the trading dashboard as shadow-only, not an entry authority",()=>{
 const {readFileSync}=await import("node:fs");
 const desk=readFileSync(new URL("../public/trading-desk.html",import.meta.url),"utf8");
 assert.match(desk,/strategy-ensemble\.js/);
 assert.match(desk,/paintStrategyEnsembleShadow\(shadowEnsemble\)/);
 assert.match(desk,/SHADOW · NO EXECUTION AUTHORITY/);
 assert.match(desk,/existing entry approvals and risk gates are unchanged/);
});
