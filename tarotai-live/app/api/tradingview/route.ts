import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { createHmac, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameSecret(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// TradingView alert intake only. Signals are queued for review and never execute orders.
export async function POST(request: Request) {
  const expected = process.env.TRADINGVIEW_WEBHOOK_SECRET;
  if (!expected || expected.length < 32) {
    return NextResponse.json({ error: "Webhook is not configured. Set a strong TRADINGVIEW_WEBHOOK_SECRET server-side." }, { status: 503 });
  }
  const maxPayloadBytes = 16 * 1024;
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (declaredLength > maxPayloadBytes) {
    return NextResponse.json({ error: "Alert payload is too large." }, { status: 413 });
  }
  let rawBody: string;
  try { rawBody = await request.text(); } catch {
    return NextResponse.json({ error: "Could not read alert payload" }, { status: 400 });
  }
  if (Buffer.byteLength(rawBody, "utf8") > maxPayloadBytes) {
    return NextResponse.json({ error: "Alert payload is too large." }, { status: 413 });
  }
  let body: any;
  try { body = rawBody ? JSON.parse(rawBody) : null; } catch {
    return NextResponse.json({ error: "Expected JSON alert payload" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid alert payload" }, { status: 400 });
  }
  const supplied = String(body.secret || "");
  if (!sameSecret(supplied, expected)) {
    return NextResponse.json({ error: "Unauthorized webhook" }, { status: 401 });
  }
  const symbol = String(body.symbol || "").toUpperCase();
  const action = String(body.action || body.side || "").toUpperCase();
  const allowedActions = new Set(["BUY", "SELL", "LONG", "SHORT", "EXIT", "CLOSE"]);
  if (!/^[A-Z0-9]{4,20}$/.test(symbol) || !allowedActions.has(action)) {
    return NextResponse.json({ error: "Payload must contain a valid symbol and action/side" }, { status: 400 });
  }
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) {
    return NextResponse.json({ error: "Signal storage is not configured. Set Upstash Redis server-side before enabling the webhook." }, { status: 503 });
  }
  try {
    const redis = new Redis({ url: redisUrl, token: redisToken });
    const dedupeSource = String(body.alertId || body.id || [symbol, action, body.timeframe || "", body.strategy || "", body.time || body.timestamp || "", body.price || ""].join("|"));
    const dedupeId = createHmac("sha256", expected).update(dedupeSource).digest("hex").slice(0, 32);
    const event = {
      id: dedupeId,
      receivedAt: new Date().toISOString(),
      source: "TradingView",
      symbol, action,
      timeframe: String(body.timeframe || "").slice(0, 12),
      strategy: String(body.strategy || "unspecified").slice(0, 80),
      price: Number.isFinite(Number(body.price)) ? Number(body.price) : null,
      status: "PENDING_REVIEW",
      note: "Signal queued only. No order was placed."
    };
    // Deduplication and queue insertion are one atomic Redis operation. Marking
    // the alert only after insertion prevents a failed queue write from losing it.
    const result = await redis.eval(
      "if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end " +
      "redis.call('LPUSH', KEYS[2], ARGV[1]) " +
      "redis.call('LTRIM', KEYS[2], 0, 199) " +
      "redis.call('SET', KEYS[1], '1', 'EX', 86400) " +
      "return 1",
      ["tarotai:tradingview:dedupe:" + dedupeId, "tarotai:tradingview:signals"],
      [JSON.stringify(event)]
    ) as number;
    if (Number(result) !== 1) {
      return NextResponse.json({ accepted: true, duplicate: true, status: "DUPLICATE_IGNORED", id: dedupeId, message: "Duplicate alert ignored; no order was placed." }, { status: 200 });
    }
    return NextResponse.json({ accepted: true, status: event.status, id: event.id, message: "Alert queued for review; no order was placed." }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "Could not persist signal; alert was not accepted" }, { status: 503 });
  }
}
