import { NextResponse } from "next/server";
import { isAuthorized } from "../../../../lib/auth";
import { normalizeDepthSnapshot, summarizeOrderBook } from "../../../../lib/orderbook.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!process.env.TAROTAI_ACCESS_CODE) {
    return NextResponse.json({ error: "Private access is not configured." }, { status: 503 });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const url = new URL(request.url);
  const symbol = String(url.searchParams.get("symbol") || "BTCUSDT").toUpperCase();
  if (!/^[A-Z0-9]{4,20}$/.test(symbol) || !symbol.endsWith("USDT")) {
    return NextResponse.json({ error: "Use a supported USDT-margined futures symbol." }, { status: 400 });
  }
  try {
    const endpoint = new URL("https://fapi.binance.com/fapi/v1/depth");
    endpoint.searchParams.set("symbol", symbol);
    endpoint.searchParams.set("limit", "1000");
    const response = await fetch(endpoint, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "TarotAI-ReadOnly-OrderBook" }
    });
    const payload: unknown = await response.json().catch(() => null);
    const receivedAt = Date.now();
    if (!response.ok) {
      return NextResponse.json({
        error: "Binance futures order-book snapshot request failed.",
        upstreamStatus: response.status,
        readOnly: true
      }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    const payloadWithReceipt = payload && typeof payload === "object" ? { ...(payload as Record<string, unknown>), receivedAt } : payload;
    const snapshot = normalizeDepthSnapshot(symbol, payloadWithReceipt);
    const now = receivedAt;
    const metrics = summarizeOrderBook(snapshot, now);
    if (metrics.snapshotAgeMs !== null && metrics.snapshotAgeMs > 15_000) {
      return NextResponse.json({ error: "Exchange snapshot is stale; retry before using liquidity metrics.", snapshotAgeMs: metrics.snapshotAgeMs, readOnly: true }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({
      ...metrics,
      snapshot: { lastUpdateId: snapshot.lastUpdateId, bids: snapshot.bids, asks: snapshot.asks },
      source: "Binance USDⓈ-M Futures REST order book",
      use: "Seed only: the browser must bridge this update ID with depth WebSocket updates before treating the local book as synchronized.",
      timestampCaveat: metrics.timestampSource === "local-receipt-time" ? "Binance REST depth has no exchange event timestamp; age is measured from local receipt. The browser must sequence-sync it to depth WebSocket updates for a continuously updated book." : "Snapshot timestamp is provided by the exchange; the browser must still sequence-sync a live book.",
      liveOrdersEnabled: false,
      readOnly: true
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: "A valid, fresh order-book snapshot could not be obtained.",
      detail: error instanceof Error ? error.message.slice(0, 220) : "Unknown upstream error",
      readOnly: true,
      liveOrdersEnabled: false
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
