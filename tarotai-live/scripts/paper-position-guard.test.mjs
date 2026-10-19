import test from "node:test";
import assert from "node:assert/strict";
import { claimPaperOpenSlot, PAPER_OPEN_CLAIM_TTL_SECONDS } from "../lib/paper-position-guard.mjs";

function fakeRedis() {
  const keys = new Set();
  return {
    async set(key, value, options) {
      assert.equal(value, "1");
      assert.equal(options.nx, true);
      assert.equal(options.ex, PAPER_OPEN_CLAIM_TTL_SECONDS);
      if (keys.has(key)) return null;
      keys.add(key);
      return "OK";
    }
  };
}

test("only one concurrent paper entry can claim a symbol slot", async () => {
  const redis = fakeRedis();
  const results = await Promise.all(Array.from({ length: 20 }, () => claimPaperOpenSlot(redis, "BTCUSDT")));
  assert.equal(results.filter((result) => result.claimed).length, 1);
  assert.equal(results.every((result) => result.key === "tarotai:paper:open-claims:BTCUSDT"), true);
});

test("symbol claims are shared across venues and reject malformed symbols", async () => {
  const redis = fakeRedis();
  assert.equal((await claimPaperOpenSlot(redis, "BTCUSDT")).claimed, true);
  assert.equal((await claimPaperOpenSlot(redis, "BTCUSDT")).claimed, false);
  assert.deepEqual(await claimPaperOpenSlot(redis, "BTC/USDT"), { claimed: false, key: null });
});
