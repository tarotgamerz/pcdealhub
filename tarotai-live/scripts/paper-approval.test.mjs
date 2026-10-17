import test from "node:test";
import assert from "node:assert/strict";
import { createPaperApprovalToken, verifyPaperApprovalToken } from "../lib/paper-approval.mjs";

const now = 1_800_000_000_000;
const secret = "unit-test-secret-with-more-than-thirty-two-bytes";
const payload = {
  tokenType: "PAPER_GATE", symbol: "BTCUSDT", venue: "binance", interval: "5m", candleTime: now - 300_000,
  direction: "LONG", entry: 100, stop: 95, target: 110, quantity: 10, paperEquity: 10_000, riskPct: 0.5,
  bookAgeMs: 200, bookFetchedAtMs: now, bookMid: 100.1, bookSpreadBps: 1
};

test("signs a paper-only trade gate and verifies the exact signed payload", () => {
  const token = createPaperApprovalToken(payload, secret, now);
  const verified = verifyPaperApprovalToken(token, secret, now + 500);
  assert.ok(verified);
  assert.equal(verified.tokenType, "PAPER_GATE");
  assert.equal(verified.entry, 100);
  assert.equal(verified.nonce.length > 20, true);
});

test("rejects altered, forged, wrong-secret and expired approvals", () => {
  const token = createPaperApprovalToken(payload, secret, now);
  const [body, signature] = token.split(".");
  const replacement = signature[0] === "A" ? "B" : "A";
  assert.equal(verifyPaperApprovalToken(body + "." + replacement + signature.slice(1), secret, now + 1), null);
  assert.equal(verifyPaperApprovalToken(token, "a-different-secret-with-more-than-32-bytes", now + 1), null);
  assert.equal(verifyPaperApprovalToken(token, secret, now + 60_001), null);
  assert.equal(verifyPaperApprovalToken(token, secret, now - 1), null);
});

test("rejects stale depth, widened spread, excessive entry drift and over-risk sizing", () => {
  for (const override of [
    { bookAgeMs: 15_001 },
    { bookSpreadBps: 10.1 },
    { bookMid: 100.3 },
    { quantity: 11 }
  ]) {
    const token = createPaperApprovalToken({ ...payload, ...override }, secret, now);
    assert.equal(verifyPaperApprovalToken(token, secret, now + 200), null);
  }
});

test("supports a short-lived execution token but still enforces its own expiry", () => {
  const token = createPaperApprovalToken({ ...payload, tokenType: "PAPER_EXECUTION" }, secret, now, 15_000);
  assert.ok(verifyPaperApprovalToken(token, secret, now + 14_000));
  assert.equal(verifyPaperApprovalToken(token, secret, now + 15_001), null);
});
