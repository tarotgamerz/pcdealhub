import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// These remain false until a separately reviewed production execution adapter,
// exchange-side protective-exit workflow, and strategy evidence are implemented.
const LIVE_ORDER_ADAPTER_IMPLEMENTED = false;
const PROTECTIVE_EXIT_AUTOMATION_VERIFIED = false;
const STRATEGY_EVIDENCE_APPROVED = false;

/**
 * Reports readiness blockers only. This route never sends exchange requests
 * and cannot enable or authorize live orders.
 */
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };

  if (!process.env.TAROTAI_ACCESS_CODE) {
    return NextResponse.json(
      { status: "BLOCKED", error: "Private access is not configured.", orderPlacement: false, canPlaceLiveOrders: false },
      { status: 503, headers }
    );
  }
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { status: "BLOCKED", error: "Authentication required.", orderPlacement: false, canPlaceLiveOrders: false },
      { status: 401, headers }
    );
  }

  const requiredTradingEnvironment = [
    "BINANCE_USDM_TRADING_API_KEY",
    "BINANCE_USDM_TRADING_API_SECRET"
  ];
  const missingTradingEnvironment = requiredTradingEnvironment.filter((name) => !process.env[name]);
  const tradingCredentialsConfigured = missingTradingEnvironment.length === 0;
  const liveTradingFeatureFlagEnabled = process.env.TAROTAI_LIVE_TRADING_ENABLED === "true";
  // The stop is engaged unless an operator explicitly changes this setting.
  const globalEmergencyStopEngaged = process.env.TAROTAI_GLOBAL_EMERGENCY_STOP !== "false";

  const blockers: string[] = [];
  if (!tradingCredentialsConfigured) blockers.push("SEPARATE_PRODUCTION_FUTURES_CREDENTIALS_MISSING");
  if (!liveTradingFeatureFlagEnabled) blockers.push("LIVE_TRADING_FEATURE_FLAG_DISABLED");
  if (globalEmergencyStopEngaged) blockers.push("GLOBAL_EMERGENCY_STOP_ENGAGED");
  if (!LIVE_ORDER_ADAPTER_IMPLEMENTED) blockers.push("PRODUCTION_ORDER_ADAPTER_NOT_IMPLEMENTED");
  if (!PROTECTIVE_EXIT_AUTOMATION_VERIFIED) blockers.push("EXCHANGE_SIDE_PROTECTIVE_EXITS_NOT_VERIFIED");
  if (!STRATEGY_EVIDENCE_APPROVED) blockers.push("STRATEGY_PROFITABILITY_EVIDENCE_NOT_APPROVED");

  // Even a clean diagnostic result is not permission to submit orders. This
  // release deliberately has no production order-submission path.
  const status = blockers.length === 0 ? "READY_FOR_OPERATOR_REVIEW" : "BLOCKED";
  return NextResponse.json(
    {
      status,
      mode: "read-only-live-execution-readiness",
      checkedAt: new Date().toISOString(),
      tradingCredentialsConfigured,
      missingTradingEnvironment,
      liveTradingFeatureFlagEnabled,
      globalEmergencyStopEngaged,
      liveOrderAdapterImplemented: LIVE_ORDER_ADAPTER_IMPLEMENTED,
      protectiveExitAutomationVerified: PROTECTIVE_EXIT_AUTOMATION_VERIFIED,
      strategyEvidenceApproved: STRATEGY_EVIDENCE_APPROVED,
      blockers,
      operatorApprovalRequired: true,
      orderPlacement: false,
      canPlaceLiveOrders: false,
      note: "Diagnostics only. This route sends no exchange requests and cannot enable live trading."
    },
    { headers }
  );
}
