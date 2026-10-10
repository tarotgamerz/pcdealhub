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
  let body: any;
  try { body = await request.json(); } catch {
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
    const firstSeen = await redis.set("tarotai:tradingview:dedupe:" + dedupeId, "1", { nx: true, ex: 86400 });
    if (firstSeen !== "OK") return NextResponse.json({ accepted: true, duplicate: true, status: "DUPLICATE_IGNORED", id: dedupeId, message: "Duplicate alert ignored; no order was placed." }, { status: 200 });
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
    await redis.lpush("tarotai:tradingview:signals", JSON.stringify(event));
    await redis.ltrim("tarotai:tradingview:signals", 0, 199);
    return NextResponse.json({ accepted: true, status: event.status, id: event.id, message: "Alert queued for review; no order was placed." }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "Could not persist signal; alert was not accepted" }, { status: 503 });
  }
}
