import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseApiKeyPermissions } from "../lib/binance-api-permissions.mjs";

const accountRoute = readFileSync(new URL("../app/api/exchanges/account/route.ts", import.meta.url), "utf8");
const liveReadinessRoute = readFileSync(new URL("../app/api/trading/live-readiness/route.ts", import.meta.url), "utf8");

test("normalizes documented Binance API-key permissions without guessing missing values", () => {
  const permissions = parseApiKeyPermissions({
    enableReading: true,
    enableFutures: false,
    enableWithdrawals: false,
    ipRestrict: true,
    enableSpotAndMarginTrading: false,
    enableMargin: false,
    enableInternalTransfer: false,
    permitsUniversalTransfer: false
  });
  assert.deepEqual(permissions, {
    enableReading: true,
    enableFutures: false,
    enableWithdrawals: false,
    ipRestrict: true,
    enableSpotAndMarginTrading: false,
    enableMargin: false,
    enableInternalTransfer: false,
    permitsUniversalTransfer: false,
    enableVanillaOptions: null,
    enableFixApiTrade: null,
    enableFixReadOnly: null,
    enablePortfolioMarginTrading: null
  });
});

test("rejects malformed permission payloads and missing required booleans", () => {
  assert.equal(parseApiKeyPermissions(null), null);
  assert.equal(parseApiKeyPermissions([]), null);
  assert.equal(parseApiKeyPermissions({ enableReading: true }), null);
  assert.equal(parseApiKeyPermissions({
    enableReading: "true",
    enableFutures: false,
    enableWithdrawals: false,
    ipRestrict: true
  }), null);
});

test("production account route requests the documented API-key permission endpoint with GET only", () => {
  assert.match(accountRoute, /\/sapi\/v1\/account\/apiRestrictions/);
  assert.match(accountRoute, /parseApiKeyPermissions\(permissionPayload\)/);
  assert.match(accountRoute, /method: "GET"/);
  assert.match(accountRoute, /apiKeyPermissionStatus/);
  assert.match(accountRoute, /apiKeyFuturesTradingPermissionEnabled/);
  assert.match(accountRoute, /apiKeyWithdrawalsEnabled/);
  assert.match(accountRoute, /apiKeyIpRestricted/);
  assert.match(accountRoute, /tradingCapabilityVerified: false/);
  assert.match(accountRoute, /orderPlacement: false/);
  assert.doesNotMatch(accountRoute, /fapi\/v1\/order|fapi\/v1\/algoOrder/);
});

test("live readiness diagnostics fail closed and cannot enable order placement", () => {
  assert.match(liveReadinessRoute, /const LIVE_ORDER_ADAPTER_IMPLEMENTED = false/);
  assert.match(liveReadinessRoute, /const PROTECTIVE_EXIT_AUTOMATION_VERIFIED = false/);
  assert.match(liveReadinessRoute, /const STRATEGY_EVIDENCE_APPROVED = false/);
  assert.match(liveReadinessRoute, /BINANCE_USDM_TRADING_API_KEY/);
  assert.match(liveReadinessRoute, /TAROTAI_LIVE_TRADING_ENABLED === "true"/);
  assert.match(liveReadinessRoute, /TAROTAI_GLOBAL_EMERGENCY_STOP !== "false"/);
  assert.match(liveReadinessRoute, /orderPlacement: false/);
  assert.match(liveReadinessRoute, /canPlaceLiveOrders: false/);
  assert.doesNotMatch(liveReadinessRoute, /fapi\/v1\/order|fapi\/v1\/algoOrder|fetch\(/);
});
