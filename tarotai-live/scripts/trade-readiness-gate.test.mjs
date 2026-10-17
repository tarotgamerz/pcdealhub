import test from "node:test";
import assert from "node:assert/strict";
import { evaluateTradeReadiness } from "../lib/trade-readiness-gate.mjs";

const roles = ["market", "entry", "exits", "sizing", "discipline", "position", "journal", "supervisor"];
const plan = ({ entry = "NA", stop = "NA", target = "NA", rr = "NA", quantity = "NA", drift_pct = "NA" } = {}) =>
  "TRADE_PLAN: entry=" + entry + "; stop=" + stop + "; target=" + target + "; rr=" + rr + "; quantity=" + quantity + "; drift_pct=" + drift_pct;

const healthy = ({ quantity = 10 } = {}) => roles.map((role) => ({
  role, ok: true,
  bias: ["market", "entry", "exits", "sizing", "discipline"].includes(role) ? "LONG" : "WAIT",
  veto: false, fallback: false, model: "test-model",
  text: role === "exits"
    ? plan({ entry: 100, stop: 95, target: 110, rr: 2 })
    : role === "sizing"
      ? plan({ entry: 100, stop: 95, target: 110, rr: 2, quantity })
      : plan()
}));

const market = {
  lastClosedCandleAgeSeconds: 20,
  orderBookSnapshot: { ageMs: 1000, spreadBps: 1, midPrice: 100.1 },
  paperTradeContext: { paperEquity: 10000, riskPct: 0.5 }
};

test("approves only unanimous, healthy reports with verified risk geometry", () => {
  const result = evaluateTradeReadiness(healthy(), market, 300_000);
  assert.equal(result.approved, true);
  assert.equal(result.recommendation, "LONG");
  assert.equal(result.riskGeometry.calculatedRewardRisk, 2);
  assert.equal(result.riskGeometry.cashRisk, 50);
  assert.deepEqual(result.blockers, []);
});

test("vetoes deterministic fallback even if all directional votes agree", () => {
  const results = healthy();
  results[0].fallback = true;
  results[0].providerStatus = "degraded";
  const result = evaluateTradeReadiness(results, market, 300_000);
  assert.equal(result.approved, false);
  assert.equal(result.recommendation, "WAIT");
  assert.ok(result.blockers.some((item) => item.includes("fallback")));
});

test("vetoes conflicting specialist direction", () => {
  const results = healthy();
  results.find((r) => r.role === "entry").bias = "SHORT";
  const result = evaluateTradeReadiness(results, market, 300_000);
  assert.equal(result.approved, false);
  assert.ok(result.blockers.some((item) => item.includes("disagree")));
});

test("vetoes stale market data and any specialist veto", () => {
  const results = healthy();
  results.find((r) => r.role === "position").veto = true;
  const result = evaluateTradeReadiness(results, { ...market, lastClosedCandleAgeSeconds: 700 }, 300_000);
  assert.equal(result.approved, false);
  assert.ok(result.blockers.some((item) => item.includes("veto")));
  assert.ok(result.blockers.some((item) => item.includes("stale")));
});

test("vetoes missing or duplicate reports and WAIT votes", () => {
  const missing = healthy().slice(0, 7);
  assert.equal(evaluateTradeReadiness(missing, market, 300_000).approved, false);
  const duplicate = healthy();
  duplicate[7] = { ...duplicate[6], role: "journal" };
  const duplicateResult = evaluateTradeReadiness(duplicate, market, 300_000);
  assert.equal(duplicateResult.approved, false);
  assert.ok(duplicateResult.blockers.some((item) => item.includes("unique")));
  const waiting = healthy();
  waiting.find((r) => r.role === "market").bias = "WAIT";
  assert.equal(evaluateTradeReadiness(waiting, market, 300_000).approved, false);
});

test("vetoes incomplete price plans, low reward/risk and mismatched sizing", () => {
  const incomplete = healthy();
  incomplete.find((r) => r.role === "exits").text = plan({ entry: 100, stop: 95, target: 106, rr: 1.2 });
  const incompleteResult = evaluateTradeReadiness(incomplete, market, 300_000);
  assert.equal(incompleteResult.approved, false);
  assert.ok(incompleteResult.blockers.some((item) => item.includes("below 2R")));

  const mismatch = healthy();
  mismatch.find((r) => r.role === "sizing").text = plan({ entry: 100, stop: 95, target: 110, rr: 2, quantity: 12 });
  const mismatchResult = evaluateTradeReadiness(mismatch, market, 300_000);
  assert.equal(mismatchResult.approved, false);
  assert.ok(mismatchResult.blockers.some((item) => item.includes("risk budget")));
});

test("vetoes stale or expensive books and excessive entry drift", () => {
  const staleBook = evaluateTradeReadiness(healthy(), {
    ...market, orderBookSnapshot: { ageMs: 16000, spreadBps: 1, midPrice: 100.1 }
  }, 300_000);
  assert.equal(staleBook.approved, false);
  assert.ok(staleBook.blockers.some((item) => item.includes("stale")));

  const expensiveBook = evaluateTradeReadiness(healthy(), {
    ...market, orderBookSnapshot: { ageMs: 1000, spreadBps: 12, midPrice: 100.1 }
  }, 300_000);
  assert.equal(expensiveBook.approved, false);
  assert.ok(expensiveBook.blockers.some((item) => item.includes("spread")));

  const chasing = evaluateTradeReadiness(healthy(), {
    ...market, orderBookSnapshot: { ageMs: 1000, spreadBps: 1, midPrice: 100.5 }
  }, 300_000);
  assert.equal(chasing.approved, false);
  assert.ok(chasing.blockers.some((item) => item.includes("drift")));
});

test("vetoes if no fresh same-venue order-book snapshot or paper risk settings exist", () => {
  const noBook = evaluateTradeReadiness(healthy(), { ...market, orderBookSnapshot: null }, 300_000);
  assert.equal(noBook.approved, false);
  assert.ok(noBook.blockers.some((item) => item.includes("order-book snapshot")));
  const noRisk = evaluateTradeReadiness(healthy(), {
    ...market, paperTradeContext: { paperEquity: null, riskPct: null }
  }, 300_000);
  assert.equal(noRisk.approved, false);
  assert.ok(noRisk.blockers.some((item) => item.includes("paper equity")));
});
