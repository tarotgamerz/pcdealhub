export function applySlippage(side, price, bps) {
 if (!["BUY","SELL"].includes(side) || !Number.isFinite(price) || price <= 0 || !Number.isFinite(bps) || bps < 0 || bps > 50) throw new Error("invalid fill inputs");
 return price * (1 + (side === "BUY" ? 1 : -1) * bps / 10000);
}
export function calculateFee(fillPrice, quantity, feeBps) {
 if (![fillPrice, quantity, feeBps].every(Number.isFinite) || fillPrice <= 0 || quantity <= 0 || feeBps < 0 || feeBps > 50) throw new Error("invalid fee inputs");
 return fillPrice * quantity * feeBps / 10000;
}
export function isStale(timestamp, now = Date.now(), maxAgeMs = 60000) {
 return !Number.isFinite(timestamp) || timestamp <= 0 || now < timestamp || now - timestamp > maxAgeMs;
}
export function validateStops(side, entry, stop, target) {
 if (![entry,stop,target].every(Number.isFinite) || entry<=0 || stop<=0 || target<=0) return false;
 return side==="LONG" ? stop<entry && target>entry : side==="SHORT" ? target<entry && entry<stop : false;
}
export const PAPER_MAX_POSITION_EXPOSURE_PCT = 5;
export const PAPER_MAX_PORTFOLIO_EXPOSURE_PCT = 20;

export function calculatePaperQuantity({ balance, riskPct, entry, stop, maxExposurePct = PAPER_MAX_POSITION_EXPOSURE_PCT }) {
 if (![balance, riskPct, entry, stop, maxExposurePct].every(Number.isFinite) || balance < 100 || balance > 10000000 || riskPct < 0.1 || riskPct > 1 || entry <= 0 || stop <= 0 || entry === stop || maxExposurePct <= 0 || maxExposurePct > PAPER_MAX_POSITION_EXPOSURE_PCT) {
  throw new Error("invalid paper sizing inputs");
 }
 const riskBudget = balance * riskPct / 100;
 const maxNotional = balance * maxExposurePct / 100;
 return Math.min(riskBudget / Math.abs(entry - stop), maxNotional / entry);
}

export function validatePaperExposure({ balance, riskPct, entry, stop, quantity, existingExposure = 0, maxExposurePct = PAPER_MAX_POSITION_EXPOSURE_PCT, maxTotalExposurePct = PAPER_MAX_PORTFOLIO_EXPOSURE_PCT }) {
 if (![balance, riskPct, entry, stop, quantity, existingExposure, maxExposurePct, maxTotalExposurePct].every(Number.isFinite) || balance < 100 || balance > 10000000 || riskPct < 0.1 || riskPct > 1 || entry <= 0 || stop <= 0 || entry === stop || quantity <= 0 || existingExposure < 0 || maxExposurePct <= 0 || maxExposurePct > PAPER_MAX_POSITION_EXPOSURE_PCT || maxTotalExposurePct <= 0 || maxTotalExposurePct > 100) {
  return "Invalid paper balance, risk, exposure, or position sizing inputs.";
 }
 const notional = entry * quantity;
 const plannedRisk = Math.abs(entry - stop) * quantity;
 const epsilon = Math.max(1e-8, balance * 1e-10);
 if (notional > balance * maxExposurePct / 100 + epsilon) return "Paper entry blocked: position notional exceeds the 5% per-position exposure cap.";
 if (plannedRisk > balance * riskPct / 100 + epsilon) return "Paper entry blocked: stop-distance risk exceeds the selected risk budget.";
 if (existingExposure + notional > balance * maxTotalExposurePct / 100 + epsilon) return "Paper entry blocked: total open paper exposure would exceed the 20% portfolio cap.";
 return null;
}

export function resolveStopTarget(candle, side, stop, target) {
 if (![candle?.open,candle?.high,candle?.low].every(Number.isFinite)) throw new Error("invalid candle");
 const stopHit = side==="LONG" ? candle.low<=stop : candle.high>=stop;
 const targetHit = side==="LONG" ? candle.high>=target : candle.low<=target;
 if (stopHit) return {exit:"STOP", price: candle.open < stop && side==="LONG" ? candle.open : candle.open > stop && side==="SHORT" ? candle.open : stop, ambiguous:targetHit};
 if (targetHit) return {exit:"TARGET", price:target, ambiguous:false};
 return {exit:null,price:null,ambiguous:false};
}


export function resolveTargetOnlyObservation(candle, side, stop, target) {
 if (![candle?.open,candle?.high,candle?.low,stop,target].every(Number.isFinite) || candle.open<=0 || candle.low<=0 || candle.high<candle.low || stop<=0 || target<=0 || !["LONG","SHORT"].includes(side)) throw new Error("invalid target-only observation inputs");
 const stopTouched = side==="LONG" ? candle.low<=stop : candle.high>=stop;
 const targetTouched = side==="LONG" ? candle.high>=target : candle.low<=target;
 if (stopTouched && targetTouched) return {exit:null,price:null,ambiguous:true,stopTouched:true,targetTouched:true};
 if (targetTouched) return {exit:"TARGET",price:target,ambiguous:false,stopTouched:false,targetTouched:true};
 return {exit:null,price:null,ambiguous:false,stopTouched,targetTouched:false};
}

export function validateOrderRequest({symbol,side,type,quantity,price,clientOrderId,venue="binance"}) {
 if (typeof symbol!=="string" || !/^[A-Z0-9]{4,20}$/.test(symbol)) return "invalid symbol";
 if (!["BUY","SELL"].includes(side)) return "invalid side";
 if (!["LIMIT","MARKET"].includes(String(type).toUpperCase())) return "invalid order type";
 if (!Number.isFinite(Number(quantity)) || Number(quantity)<=0) return "invalid quantity";
 if (String(type).toUpperCase()==="LIMIT" && (!Number.isFinite(Number(price)) || Number(price)<=0)) return "invalid limit price";
 const pattern=venue==="okx"?/^[A-Za-z0-9]{1,32}$/:venue==="bybit"?/^[A-Za-z0-9_-]{1,36}$/:/^[A-Za-z0-9_.:-]{1,36}$/;
 if (typeof clientOrderId!=="string" || !pattern.test(clientOrderId)) return "invalid client order ID";
 return null;
}
