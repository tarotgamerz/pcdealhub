import test from "node:test";
import assert from "node:assert/strict";
import {applySlippage,calculateFee,isStale,validateStops,resolveStopTarget,validateOrderRequest} from "../lib/trading-rules.mjs";
test("buy slippage worsens fill and sell slippage worsens fill",()=>{assert.equal(applySlippage("BUY",100,10),100.1);assert.equal(applySlippage("SELL",100,10),99.9)});
test("fees are charged from fill notional",()=>{assert.equal(calculateFee(100,2,10),0.2)});
test("stale data is rejected, fresh data accepted",()=>{assert.equal(isStale(1000,61001,60000),true);assert.equal(isStale(2000,61001,60000),false);assert.equal(isStale(NaN,61001,60000),true)});
test("stop geometry follows side",()=>{assert.equal(validateStops("LONG",100,95,110),true);assert.equal(validateStops("LONG",100,105,110),false);assert.equal(validateStops("SHORT",100,105,90),true)});
test("stop wins if stop and target both hit in one candle",()=>{const result=resolveStopTarget({open:100,high:112,low:94},"LONG",95,110);assert.equal(result.exit,"STOP");assert.equal(result.ambiguous,true)});
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
 assert.throws(()=>validateBacktestCandles([candles[1],candles[0]]),/strictly chronological/);
});

test("backtest rejects impossible periods and excessive cost inputs",()=>{
 const candles=sampleBacktestCandles();
 assert.throws(()=>runSmaCrossoverBacktest(candles,{fastPeriod:3,slowPeriod:2}),/Require integer periods/);
 assert.throws(()=>runSmaCrossoverBacktest(candles,{fastPeriod:2,slowPeriod:3,feeBps:51}),/between 0 and 50/);
});
