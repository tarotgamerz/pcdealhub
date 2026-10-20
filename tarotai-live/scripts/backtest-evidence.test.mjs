import test from "node:test";
import assert from "node:assert/strict";
import {
  assessBacktestEvidence,
  calculateFundingPnlFraction,
  runSmaCrossoverBacktest,
  validateFundingRates
} from "../lib/trading-backtest.mjs";

const slices = (returns, trades = 12) => returns.map((netReturnPct, i) => ({
  slice: i + 1, results: { closedTrades: trades, netReturnPct }
}));
const good = { closedTrades: 36, netReturnPct: 8, profitFactor: 1.45, maxDrawdownPct: 9 };

function sampleCandles() {
  const closes = [3,2,1,2,3,4,2,1,0.5,1,0.8,0.6,0.9,1.2,1.5,1.8,1.3,0.8,0.6,0.4,0.7,1.0];
  return closes.map((close,i) => {
    const time = 1_700_000_000_000 + i * 300_000;
    const open = close + 0.2;
    return {
      time, open, high: Math.max(open,close)+0.1, low: Math.min(open,close)-0.1,
      close, volume: 10, closeTime: time + 300_000 - 1
    };
  });
}

test("low trade count can never be labeled ready for paper forward testing", () => {
  const result = assessBacktestEvidence({ ...good, closedTrades: 29 }, slices([2, 3, 4]), { fundingHistoryVerified: true });
  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.mayStartPaperForwardTest, false);
  assert.equal(result.mayPlaceLiveOrders, false);
});

test("strong enough holdout only qualifies for paper forward testing with verified funding data", () => {
  const result = assessBacktestEvidence(good, slices([2, -1, 4]), { fundingHistoryVerified: true });
  assert.equal(result.status, "PAPER_FORWARD_TEST_ONLY");
  assert.equal(result.mayStartPaperForwardTest, true);
  assert.equal(result.mayPlaceLiveOrders, false);
  assert.equal(result.fundingHistoryVerified, true);
});

test("missing funding history blocks a backtest from advancing even when performance metrics look good", () => {
  const result = assessBacktestEvidence(good, slices([2, -1, 4]));
  assert.equal(result.status, "DO_NOT_ADVANCE");
  assert.equal(result.mayStartPaperForwardTest, false);
  assert.equal(result.mayPlaceLiveOrders, false);
  assert.ok(result.reasons.some((reason) => /funding-rate history/i.test(reason)));
});

test("drawdown, profit factor, or regime consistency failures block advancement", () => {
  assert.equal(assessBacktestEvidence({ ...good, maxDrawdownPct: 15.1 }, slices([2, 3, 4]), { fundingHistoryVerified: true }).status, "DO_NOT_ADVANCE");
  assert.equal(assessBacktestEvidence({ ...good, profitFactor: 1.19 }, slices([2, 3, 4]), { fundingHistoryVerified: true }).status, "DO_NOT_ADVANCE");
  assert.equal(assessBacktestEvidence(good, slices([2, -1, -4]), { fundingHistoryVerified: true }).status, "DO_NOT_ADVANCE");
});

test("under-sampled slices and uncalculable profit factor fail closed", () => {
  assert.equal(assessBacktestEvidence(good, slices([2, 3, 4], 9), { fundingHistoryVerified: true }).status, "INSUFFICIENT_EVIDENCE");
  assert.equal(assessBacktestEvidence({ ...good, profitFactor: null }, slices([2, 3, 4]), { fundingHistoryVerified: true }).status, "DO_NOT_ADVANCE");
});

test("funding transfers follow the long/short payer direction", () => {
  assert.equal(calculateFundingPnlFraction("LONG", 0.001, 100, 100), -0.001);
  assert.equal(calculateFundingPnlFraction("SHORT", 0.001, 100, 100), 0.001);
  assert.equal(calculateFundingPnlFraction("LONG", -0.001, 100, 100), 0.001);
  assert.equal(calculateFundingPnlFraction("SHORT", -0.001, 100, 100), -0.001);
});

test("funding history validation rejects malformed and unordered events", () => {
  assert.deepEqual(validateFundingRates([]), []);
  assert.throws(() => validateFundingRates(null), /array/);
  assert.throws(() => validateFundingRates([{ time: 1, rate: 0.001, markPrice: 100 }, { time: 1, rate: 0.001, markPrice: 100 }]), /chronological and unique/);
  assert.throws(() => validateFundingRates([{ time: 1, rate: 0.001, markPrice: 0 }]), /Malformed funding-rate/);
  assert.throws(() => validateFundingRates([{ time: 1, rate: "invalid", markPrice: 100 }]), /Malformed funding-rate/);
});

test("realized funding payment reduces long trade PnL and appears in backtest metrics", () => {
  const candles = sampleCandles();
  const baseline = runSmaCrossoverBacktest(candles, { fastPeriod: 2, slowPeriod: 3, feeBps: 0, slippageBps: 0 });
  const withFunding = runSmaCrossoverBacktest(candles, {
    fastPeriod: 2, slowPeriod: 3, feeBps: 0, slippageBps: 0,
    fundingRates: [{ time: candles[5].time + 60_000, rate: 0.001, markPrice: candles[5].close }]
  });
  assert.equal(baseline.fundingCostsIncluded, false);
  assert.equal(withFunding.fundingCostsIncluded, true);
  assert.ok(withFunding.netReturnPct < baseline.netReturnPct, "a positive funding rate must reduce a long's return");
  assert.equal(withFunding.fundingEventsCharged, 1);
  assert.ok(withFunding.fundingPnlPctSum < 0);
  const fundedFirstTrade = withFunding.recentTrades.find((trade) => trade.entryTime === candles[5].time);
  assert.ok(fundedFirstTrade);
  assert.ok(fundedFirstTrade.fundingPnlPct < 0);
  assert.equal(fundedFirstTrade.fundingEventsCharged, 1);
});
