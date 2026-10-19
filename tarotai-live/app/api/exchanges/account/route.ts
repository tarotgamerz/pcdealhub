import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { isAuthorized } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Production USDⓈ-M Futures account verification.
 * This handler makes an authenticated GET request only. It cannot place orders.
 * Credentials must be stored as server-side Vercel environment variables.
 */
export async function GET(request: Request) {
  if (!process.env.TAROTAI_ACCESS_CODE) {
    return NextResponse.json(
      { connected: false, mode: "read-only-account-check", error: "Private access is not configured.", orderPlacement: false },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json(
      { connected: false, mode: "read-only-account-check", error: "Authentication required.", orderPlacement: false },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const apiKey = process.env.BINANCE_USDM_READONLY_API_KEY;
  const apiSecret = process.env.BINANCE_USDM_READONLY_API_SECRET;

  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      {
        connected: false,
        mode: "read-only-account-check",
        error: "Binance read-only credentials are not configured.",
        requiredEnvironmentVariables: ["BINANCE_USDM_READONLY_API_KEY", "BINANCE_USDM_READONLY_API_SECRET"],
        orderPlacement: false
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const params = new URLSearchParams({
    recvWindow: "5000",
    timestamp: String(Date.now())
  });
  const signature = createHmac("sha256", apiSecret).update(params.toString()).digest("hex");
  params.set("signature", signature);

  try {
    const response = await fetch("https://fapi.binance.com/fapi/v3/balance?" + params.toString(), {
      method: "GET",
      headers: { "X-MBX-APIKEY": apiKey, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000)
    });
    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok || !Array.isArray(payload)) {
      const detail = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
      return NextResponse.json(
        {
          connected: false,
          mode: "read-only-account-check",
          exchange: "binance-usdm-production",
          httpStatus: response.status,
          exchangeCode: typeof detail.code === "number" ? detail.code : null,
          error: typeof detail.msg === "string" ? detail.msg.slice(0, 200) : "Binance returned an unexpected response.",
          orderPlacement: false
        },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    const balances = payload.flatMap((entry: unknown) => {
      if (!entry || typeof entry !== "object") return [];
      const row = entry as Record<string, unknown>;
      if (typeof row.asset !== "string" || !/^[A-Z0-9]{2,20}$/.test(row.asset)) return [];
      const fields = [row.balance, row.availableBalance, row.crossWalletBalance, row.crossUnPnl];
      if (fields.some((value) => value !== undefined && (
        typeof value !== "string" ||
        !/^-?(?:\d+\.?\d*|\.\d+)$/.test(value) ||
        !Number.isFinite(Number(value))
      ))) return [];
      return [{
        asset: row.asset,
        balance: String(row.balance ?? "0"),
        availableBalance: String(row.availableBalance ?? "0"),
        crossWalletBalance: String(row.crossWalletBalance ?? "0"),
        unrealizedPnl: String(row.crossUnPnl ?? "0")
      }];
    });

    if (balances.length !== payload.length) {
      return NextResponse.json(
        { connected: false, mode: "read-only-account-check", error: "Binance response validation failed; account data was withheld.", orderPlacement: false },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      {
        connected: true,
        mode: "read-only-account-check",
        exchange: "binance-usdm-production",
        verifiedAt: new Date().toISOString(),
        balances,
        orderPlacement: false
      },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch {
    return NextResponse.json(
      { connected: false, mode: "read-only-account-check", error: "Binance account check timed out or could not reach the exchange.", orderPlacement: false },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
