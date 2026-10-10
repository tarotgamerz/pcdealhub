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
