const REQUIRED_BOOLEAN_FIELDS = ["enableReading", "enableFutures", "enableWithdrawals", "ipRestrict"];

const OPTIONAL_BOOLEAN_FIELDS = [
  "enableSpotAndMarginTrading",
  "enableMargin",
  "enableInternalTransfer",
  "permitsUniversalTransfer",
  "enableVanillaOptions",
  "enableFixApiTrade",
  "enableFixReadOnly",
  "enablePortfolioMarginTrading"
];

/**
 * Normalizes only documented boolean permission fields from Binance's
 * GET /sapi/v1/account/apiRestrictions response. Missing/incorrect required
 * fields fail closed: callers must report the permissions as unknown.
 */
export function parseApiKeyPermissions(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (REQUIRED_BOOLEAN_FIELDS.some((field) => typeof payload[field] !== "boolean")) return null;

  const result = {};
  for (const field of REQUIRED_BOOLEAN_FIELDS) result[field] = payload[field];
  for (const field of OPTIONAL_BOOLEAN_FIELDS) {
    result[field] = typeof payload[field] === "boolean" ? payload[field] : null;
  }
  return result;
}
