import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const PAPER_APPROVAL_TTL_MS = 60_000;
export const PAPER_BOOK_MAX_AGE_MS = 15_000;
export const PAPER_MAX_SPREAD_BPS = 10;
export const PAPER_MAX_ENTRY_DRIFT = 0.0025;

const ALLOWED_VENUES = new Set(["binance", "bybit", "okx"]);
const ALLOWED_INTERVALS = new Set(["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "1d"]);
const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

export function createPaperApprovalToken(payload, secret, now = Date.now(), ttlMs = PAPER_APPROVAL_TTL_MS) {
  if (typeof secret !== "string" || secret.length < 16) throw new Error("A sufficiently strong server-side signing secret is required.");
  if (!payload || typeof payload !== "object" || !Number.isFinite(now) ||
      !Number.isFinite(ttlMs) || ttlMs < 1 || ttlMs > PAPER_APPROVAL_TTL_MS) {
    throw new Error("Invalid paper approval token inputs.");
  }
  const sealed = { ...payload, version: 1, issuedAt: now, expiresAt: now + ttlMs, nonce: randomUUID() };
  const encoded = Buffer.from(JSON.stringify(sealed), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return encoded + "." + signature;
}

export function verifyPaperApprovalToken(token, secret, now = Date.now()) {
  try {
    if (typeof token !== "string" || typeof secret !== "string" || secret.length < 16 || !Number.isFinite(now)) return null;
    const parts = token.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const expected = createHmac("sha256", secret).update(parts[0]).digest();
    const supplied = Buffer.from(parts[1], "base64url");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object" || payload.version !== 1) return null;

    const issuedAt = Number(payload.issuedAt);
    const expiresAt = Number(payload.expiresAt);
    const bookAgeMs = Number(payload.bookAgeMs);
    const bookFetchedAtMs = Number(payload.bookFetchedAtMs);
    if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) ||
        now < issuedAt || now > expiresAt || expiresAt <= issuedAt ||
        expiresAt - issuedAt > PAPER_APPROVAL_TTL_MS || now - issuedAt > PAPER_APPROVAL_TTL_MS ||
        typeof payload.nonce !== "string" || payload.nonce.length < 20 ||
        !Number.isFinite(bookAgeMs) || bookAgeMs < 0 || bookAgeMs > PAPER_BOOK_MAX_AGE_MS ||
        !Number.isFinite(bookFetchedAtMs) || bookFetchedAtMs > issuedAt + 1000 ||
        bookFetchedAtMs < issuedAt - 10_000 ||
        payload.tokenType === "PAPER_EXECUTION" && bookAgeMs + (now - bookFetchedAtMs) > PAPER_BOOK_MAX_AGE_MS) return null;

    if (typeof payload.symbol !== "string" || !/^[A-Z0-9]{4,20}$/.test(payload.symbol) ||
        !ALLOWED_VENUES.has(payload.venue) || !ALLOWED_INTERVALS.has(payload.interval) ||
        !["LONG", "SHORT"].includes(payload.direction) || !positive(payload.candleTime)) return null;

    const entry = Number(payload.entry), stop = Number(payload.stop), target = Number(payload.target);
    const quantity = Number(payload.quantity), equity = Number(payload.paperEquity), riskPct = Number(payload.riskPct);
    const mid = Number(payload.bookMid), spreadBps = Number(payload.bookSpreadBps);
    if (![entry, stop, target, quantity, equity, riskPct, mid, spreadBps].every(Number.isFinite) ||
        entry <= 0 || stop <= 0 || target <= 0 || quantity <= 0 || equity < 100 || equity > 10_000_000 ||
        riskPct < 0.1 || riskPct > 1 || mid <= 0 || spreadBps < 0 || spreadBps > PAPER_MAX_SPREAD_BPS) return null;

    const geometryValid = payload.direction === "LONG" ? stop < entry && target > entry : target < entry && entry < stop;
    const riskDistance = Math.abs(entry - stop);
    const rewardRisk = riskDistance > 0 ? Math.abs(target - entry) / riskDistance : 0;
    const minimumRR = payload.tokenType === "PAPER_EXECUTION" ? 1.9 : 2;
    const maxQuantity = riskDistance > 0 ? Math.min(equity * riskPct / 100 / riskDistance, equity / entry) : 0;
    if (!geometryValid || rewardRisk < minimumRR || quantity > maxQuantity * 1.001 ||
        Math.abs(mid - entry) / entry > PAPER_MAX_ENTRY_DRIFT) return null;
    if (!["PAPER_GATE", "PAPER_EXECUTION"].includes(payload.tokenType)) return null;
    return payload;
  } catch {
    return null;
  }
}
