import test from "node:test";
import assert from "node:assert/strict";
import { assessBacktestEvidence } from "../lib/trading-backtest.mjs";

const slices = (returns, trades = 12) => returns.map((netReturnPct, i) => ({
  slice: i + 1, results: { closedTrades: trades, netReturnPct }
}));
const good = { closedTrades: 36, netReturnPct: 8, profitFactor: 1.45, maxDrawdownPct: 9 };

test("low trade count can never be labeled ready for paper forward testing", () => {
  const result = assessBacktestEvidence({ ...good, closedTrades: 29 }, slices([2, 3, 4]));
  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.mayStartPaperForwardTest, false);
  assert.equal(result.mayPlaceLiveOrders, false);
});

test("strong enough holdout only qualifies for paper forward testing, never live orders", () => {
  const result = assessBacktestEvidence(good, slices([2, -1, 4]));
  assert.equal(result.status, "PAPER_FORWARD_TEST_ONLY");
  assert.equal(result.mayStartPaperForwardTest, true);
  assert.equal(result.mayPlaceLiveOrders, false);
});

test("drawdown, profit factor, or regime consistency failures block advancement", () => {
  assert.equal(assessBacktestEvidence({ ...good, maxDrawdownPct: 15.1 }, slices([2, 3, 4])).status, "DO_NOT_ADVANCE");
  assert.equal(assessBacktestEvidence({ ...good, profitFactor: 1.19 }, slices([2, 3, 4])).status, "DO_NOT_ADVANCE");
  assert.equal(assessBacktestEvidence(good, slices([2, -1, -4])).status, "DO_NOT_ADVANCE");
});

test("under-sampled slices and uncalculable profit factor fail closed", () => {
  assert.equal(assessBacktestEvidence(good, slices([2, 3, 4], 9)).status, "INSUFFICIENT_EVIDENCE");
  assert.equal(assessBacktestEvidence({ ...good, profitFactor: null }, slices([2, 3, 4])).status, "DO_NOT_ADVANCE");
});
