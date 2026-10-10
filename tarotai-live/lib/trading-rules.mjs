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
export function resolveStopTarget(candle, side, stop, target) {
 if (![candle?.open,candle?.high,candle?.low].every(Number.isFinite)) throw new Error("invalid candle");
 const stopHit = side==="LONG" ? candle.low<=stop : candle.high>=stop;
 const targetHit = side==="LONG" ? candle.high>=target : candle.low<=target;
 if (stopHit) return {exit:"STOP", price: candle.open < stop && side==="LONG" ? candle.open : candle.open > stop && side==="SHORT" ? candle.open : stop, ambiguous:targetHit};
 if (targetHit) return {exit:"TARGET", price:target, ambiguous:false};
 return {exit:null,price:null,ambiguous:false};
}
