export const PAPER_OPEN_CLAIM_TTL_SECONDS = 30;
const ALLOWED_SYMBOL = /^[A-Z0-9]{4,20}$/;

/** Atomically claims the short-lived slot used to serialize concurrent paper entries for one symbol. */
export async function claimPaperOpenSlot(redis, symbol) {
  if (!redis || typeof redis.set !== "function") throw new Error("A Redis-compatible atomic set store is required.");
  if (typeof symbol !== "string" || !ALLOWED_SYMBOL.test(symbol)) return { claimed: false, key: null };
  const key = "tarotai:paper:open-claims:" + symbol;
  const result = await redis.set(key, "1", { ex: PAPER_OPEN_CLAIM_TTL_SECONDS, nx: true });
  return { claimed: result === "OK" || result === true, key };
}
