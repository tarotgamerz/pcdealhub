import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { isAuthorized } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type BinanceObject = Record<string, unknown>;

function signedQuery(secret: string): URLSearchParams {
  const params = new URLSearchParams({
    recvWindow: "5000",
    timestamp: String(Date.now())
  });
  params.set("signature", createHmac("sha256", secret).update(params.toString()).digest("hex"));
  return params;
}

async function binanceGet(path: string, apiKey: string, secret: string) {
  const params = signedQuery(secret);
  const response = await fetch("https://fapi.binance.com" + path + "?" + params.toString(), {
    method: "GET",
    headers: { "X-MBX-APIKEY": apiKey, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000)
  });
  const payload: unknown = await response.json().catch(() => null);
  return { response, payload };
}

/**
 * Authenticated, production USDⓈ-M Futures account verification.
 * Signed GET requests only. This endpoint never submits, modifies, or cancels orders.
 */
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };

  if (!process.env.TAROTAI_ACCESS_CODE) {
    return NextResponse.json(
      { connected: false, mode: "read-only-account-check", error: "Private access is not configured.", orderPlacement: false },
      { status: 503, headers }
    );
  }
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { connected: false, mode: "read-only-account-check", error: "Authentication required.", orderPlacement: false },
      { status: 401, headers }
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
      { status: 503, headers }
    );
  }

  try {
    // This reports the Futures account's trade-enabled state without attempting an order.
    const accountResult = await binanceGet("/fapi/v3/account", apiKey, apiSecret);
    const account = accountResult.payload as BinanceObject | null;
    if (!accountResult.response.ok || !account || typeof account !== "object" || typeof account.canTrade !== "boolean") {
      return NextResponse.json(
        {
          connected: false,
          mode: "read-only-account-check",
          exchange: "binance-usdm-production",
          httpStatus: accountResult.response.status,
          exchangeCode: typeof account?.code === "number" ? account.code : null,
          error: typeof account?.msg === "string" ? account.msg.slice(0, 200) : "Binance account permission response was invalid.",
          orderPlacement: false
        },
        { status: 502, headers }
      );
    }

    const balanceResult = await binanceGet("/fapi/v3/balance", apiKey, apiSecret);
    const payload = balanceResult.payload;
    if (!balanceResult.response.ok || !Array.isArray(payload)) {
      const detail = payload && typeof payload === "object" ? payload as BinanceObject : {};
      return NextResponse.json(
        {
          connected: false,
          mode: "read-only-account-check",
          exchange: "binance-usdm-production",
          httpStatus: balanceResult.response.status,
          exchangeCode: typeof detail.code === "number" ? detail.code : null,
          error: typeof detail.msg === "string" ? detail.msg.slice(0, 200) : "Binance returned an unexpected balance response.",
          orderPlacement: false
        },
        { status: 502, headers }
      );
    }

    const balances = payload.flatMap((entry: unknown) => {
      if (!entry || typeof entry !== "object") return [];
      const row = entry as BinanceObject;
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
        { status: 502, headers }
      );
    }

    return NextResponse.json(
      {
        connected: true,
        mode: "read-only-account-check",
        exchange: "binance-usdm-production",
        verifiedAt: new Date().toISOString(),
        accountCanTrade: account.canTrade,
        accountCanDeposit: typeof account.canDeposit === "boolean" ? account.canDeposit : null,
        accountCanWithdraw: typeof account.canWithdraw === "boolean" ? account.canWithdraw : null,
        tradingCapabilityVerified: false,
        tradingCapabilityNote: "Account connectivity is verified, but API-key order permission is not proven by a read-only request. No test or live order was submitted.",
        balances,
        orderPlacement: false
      },
      { headers }
    );
  } catch {
    return NextResponse.json(
      { connected: false, mode: "read-only-account-check", error: "Binance account check timed out or could not reach the exchange.", orderPlacement: false },
      { status: 502, headers }
    );
  }
}
