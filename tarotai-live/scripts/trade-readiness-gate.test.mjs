import test from "node:test";
import assert from "node:assert/strict";
import { evaluateTradeReadiness } from "../lib/trade-readiness-gate.mjs";

const roles = ["market", "entry", "exits", "sizing", "discipline", "position", "journal", "supervisor"];
const healthy = () => roles.map((role) => ({
  role, ok: true, bias: ["market", "entry", "exits", "sizing", "discipline"].includes(role) ? "LONG" : "WAIT",
  veto: false, fallback: false, model: "test-model"
}));
const market = { lastClosedCandleAgeSeconds: 20 };

test("approves only unanimous, healthy directional paper setup candidates", () => {
  const result = evaluateTradeReadiness(healthy(), market, 300_000);
  assert.equal(result.approved, true);
  assert.equal(result.recommendation, "LONG");
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
  const result = evaluateTradeReadiness(results, { lastClosedCandleAgeSeconds: 700 }, 300_000);
  assert.equal(result.approved, false);
  assert.ok(result.blockers.some((item) => item.includes("veto")));
  assert.ok(result.blockers.some((item) => item.includes("stale")));
});

test("vetoes missing or duplicate reports and WAIT votes", () => {
  const missing = healthy().slice(0, 7);
  assert.equal(evaluateTradeReadiness(missing, market, 300_000).approved, false);
  const waiting = healthy();
  waiting.find((r) => r.role === "market").bias = "WAIT";
  assert.equal(evaluateTradeReadiness(waiting, market, 300_000).approved, false);
});
