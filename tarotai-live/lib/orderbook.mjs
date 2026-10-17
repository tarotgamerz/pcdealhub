const finitePositive = (value) => Number.isFinite(value) && value > 0;

function normalizeLevels(levels, side) {
  if (!Array.isArray(levels)) throw new Error("Malformed order-book side.");
  const byPrice = new Map();
  for (const row of levels) {
    if (!Array.isArray(row) || row.length < 2) throw new Error("Malformed order-book level.");
    const price = Number(row[0]);
    const quantity = Number(row[1]);
    if (!finitePositive(price) || !Number.isFinite(quantity) || quantity < 0) {
      throw new Error("Order book contains an invalid price or quantity.");
    }
    if (quantity === 0) continue;
    byPrice.set(price, quantity);
  }
  return Array.from(byPrice, ([price, quantity]) => [price, quantity])
    .sort((a, b) => side === "bid" ? b[0] - a[0] : a[0] - b[0]);
}

export function normalizeDepthSnapshot(symbol, payload) {
  if (typeof symbol !== "string" || !/^[A-Z0-9]{4,20}$/.test(symbol)) {
    throw new Error("Invalid market symbol.");
  }
  const updateId = Number(payload?.lastUpdateId);
  if (!Number.isSafeInteger(updateId) || updateId < 0) throw new Error("Snapshot update ID is missing.");
  const bids = normalizeLevels(payload?.bids, "bid");
  const asks = normalizeLevels(payload?.asks, "ask");
  if (!bids.length || !asks.length) throw new Error("The order book has an empty side.");
  if (bids[0][0] >= asks[0][0]) throw new Error("The order book is crossed or inconsistent.");
  return {
    symbol,
    lastUpdateId: updateId,
    eventTime: Number.isFinite(Number(payload?.E)) ? Number(payload.E) : null,
    transactionTime: Number.isFinite(Number(payload?.T)) ? Number(payload.T) : null,
    bids,
    asks
  };
}

export function summarizeOrderBook(snapshot, now = Date.now()) {
  const bids = snapshot.bids;
  const asks = snapshot.asks;
  const bestBid = bids[0][0];
  const bestAsk = asks[0][0];
  const mid = (bestBid + bestAsk) / 2;
  const spread = bestAsk - bestBid;
  const inBand = (levels, lower, upper) => levels.filter(([price]) => price >= lower && price <= upper);
  const quoteDepth = (levels) => levels.reduce((sum, [price, quantity]) => sum + price * quantity, 0);
  const bidDepth = quoteDepth(inBand(bids, mid * 0.995, mid));
  const askDepth = quoteDepth(inBand(asks, mid, mid * 1.005));
  const total = bidDepth + askDepth;
  const ageMs = snapshot.eventTime == null ? null : Math.max(0, now - snapshot.eventTime);
  return {
    symbol: snapshot.symbol,
    fetchedAt: now,
    exchangeEventTime: snapshot.eventTime,
    snapshotAgeMs: ageMs,
    lastUpdateId: snapshot.lastUpdateId,
    bestBid,
    bestAsk,
    midPrice: mid,
    spread,
    spreadBps: mid > 0 ? spread / mid * 10_000 : null,
    bidDepthQuote0_5Pct: bidDepth,
    askDepthQuote0_5Pct: askDepth,
    depthImbalancePct: total > 0 ? (bidDepth - askDepth) / total * 100 : null,
    bidLevels: bids.slice(0, 8).map(([price, quantity]) => ({ price, quantity, quoteNotional: price * quantity })),
    askLevels: asks.slice(0, 8).map(([price, quantity]) => ({ price, quantity, quoteNotional: price * quantity })),
    semantics: "Single exchange snapshot, not historical liquidity or a prediction; resting orders may cancel or move."
  };
}
