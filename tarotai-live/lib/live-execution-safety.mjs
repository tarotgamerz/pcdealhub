/**
 * Live execution remains fail-closed. This module only evaluates readiness;
 * it never submits orders or enables live trading.
 */
export const LIVE_EXECUTION_ENV = "TAROTAI_LIVE_TRADING_ENABLED";
export const LIVE_KILL_SWITCH_ENV = "TAROTAI_LIVE_TRADING_KILL_SWITCH";
export const MAX_RISK_PER_TRADE_PCT = 0.25;
export const MAX_DAILY_LOSS_PCT = 1;
export const MAX_LEVERAGE = 2;
export const MAX_OPEN_NOTIONAL_MULTIPLE = 1;
export const MAX_MARKET_DATA_AGE_MS = 5_000;
export const MAX_ORDERBOOK_AGE_MS = 1_500;
export const MAX_SPREAD_BPS = 5;

const truthy = (value) => value === "true";
const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

export function evaluateLiveExecutionReadiness({ env = {}, account, market, agents, order, stopLoss, duplicate }) {
  const blockers = [];
  // Two independent opt-ins are required, and the emergency stop overrides both.
  if (!truthy(env[LIVE_EXECUTION_ENV])) blockers.push("Live execution is not explicitly enabled server-side.");
  if (!truthy(env.TAROTAI_LIVE_TRADING_ARMED)) blockers.push("Live execution has not been separately armed.");
  if (truthy(env[LIVE_KILL_SWITCH_ENV])) blockers.push("Global emergency stop is active.");
  if (!env.BINANCE_LIVE_API_KEY || !env.BINANCE_LIVE_API_SECRET) blockers.push("Dedicated Binance live API credentials are missing.");
  if (env.BINANCE_LIVE_API_KEY === env.BINANCE_TESTNET_API_KEY) blockers.push("Live and demo API keys must be distinct.");

  if (!account || !positive(account.equity) || !positive(account.availableBalance)) blockers.push("Verified live account equity and available balance are required.");
  if (!market || !Number.isFinite(market.marketDataAgeMs) || market.marketDataAgeMs < 0 || market.marketDataAgeMs > MAX_MARKET_DATA_AGE_MS) blockers.push("Market data is missing, stale, or timestamp-invalid.");
  if (!market || !Number.isFinite(market.orderBookAgeMs) || market.orderBookAgeMs < 0 || market.orderBookAgeMs > MAX_ORDERBOOK_AGE_MS) blockers.push("Order-book snapshot is missing or stale.");
  if (!market || !Number.isFinite(market.spreadBps) || market.spreadBps < 0 || market.spreadBps > MAX_SPREAD_BPS) blockers.push("Spread exceeds the strict execution ceiling.");

  if (!Array.isArray(agents) || agents.length !== 8 || new Set(agents.map((a) => a?.role)).size !== 8 ||
      agents.some((a) => a?.ok !== true || a?.fallback || a?.veto || !["LONG", "SHORT"].includes(a?.bias))) {
    blockers.push("All eight healthy, unique, non-fallback agents must return a non-veto directional decision.");
  } else if (new Set(agents.map((a) => a.bias)).size !== 1) {
    blockers.push("Agent direction is not unanimous.");
  }

  const riskPct = Number(order?.riskPct);
  const leverage = Number(order?.leverage);
  const qty = Number(order?.quantity);
  const entry = Number(order?.entry);
  const stop = Number(order?.stop);
  const target = Number(order?.target);
  if (!order || !["BUY", "SELL"].includes(order.side) || ![qty, entry, stop, target].every(positive)) {
    blockers.push("Order parameters or protective price levels are invalid.");
  } else {
    const long = order.side === "BUY";
    if (!(long ? stop < entry && target > entry : target < entry && entry < stop)) blockers.push("Stop-loss/target geometry conflicts with order direction.");
    const rr = Math.abs(target - entry) / Math.abs(entry - stop);
    if (!Number.isFinite(rr) || rr < 2) blockers.push("Reward-to-risk must be at least 2:1.");
    if (Number.isFinite(riskPct) && riskPct > MAX_RISK_PER_TRADE_PCT) blockers.push("Per-trade risk exceeds 0.25% of equity.");
    if (!Number.isFinite(riskPct) || riskPct <= 0) blockers.push("A positive risk percentage is required.");
    if (!Number.isFinite(leverage) || leverage < 1 || leverage > MAX_LEVERAGE) blockers.push("Leverage must be between 1x and 2x.");
    if (account && positive(account.equity) && Number.isFinite(riskPct) && riskPct > 0 &&
        qty * Math.abs(entry - stop) > account.equity * Math.min(riskPct, MAX_RISK_PER_TRADE_PCT) / 100) {
      blockers.push("Quantity exceeds the hard-capped stop-distance risk budget.");
    }
    if (account && positive(account.equity) && qty * entry > account.equity * MAX_OPEN_NOTIONAL_MULTIPLE) {
      blockers.push("Order notional exceeds the unlevered equity cap.");
    }
  }

  if (!stopLoss || stopLoss.exchangeConfirmed !== true || stopLoss.reduceOnly !== true || stopLoss.closePosition !== true) {
    blockers.push("A reduce-only exchange-confirmed protective stop is required; unprotected entry is forbidden.");
  }
  if (duplicate !== false) blockers.push("Duplicate-order state is unknown or an order ID has already been used.");
  if (!Number.isFinite(Number(account?.dailyRealizedPnl)) || Number(account?.dailyRealizedPnl) < -Number(account?.equity || 0) * MAX_DAILY_LOSS_PCT / 100) {
    blockers.push("Daily loss is unknown or has reached the 1% hard stop.");
  }

  return {
    approved: blockers.length === 0,
    status: blockers.length === 0 ? "READY_FOR_SEPARATE_OPERATOR_RELEASE" : "BLOCKED",
    blockers: [...new Set(blockers)],
    limits: {
      maxRiskPerTradePct: MAX_RISK_PER_TRADE_PCT,
      maxDailyLossPct: MAX_DAILY_LOSS_PCT,
      maxLeverage: MAX_LEVERAGE,
      maxOpenNotionalMultiple: MAX_OPEN_NOTIONAL_MULTIPLE,
      maxMarketDataAgeMs: MAX_MARKET_DATA_AGE_MS,
      maxOrderBookAgeMs: MAX_ORDERBOOK_AGE_MS,
      maxSpreadBps: MAX_SPREAD_BPS
    },
    liveOrdersEnabled: false,
    note: "Readiness evaluation only. This module never submits orders and cannot enable live execution."
  };
}
