export const ROOM_TRADING_TOPIC_PATTERN = /\b(?:trading|trade|market|chart|crypto|bitcoin|ethereum|btc(?:usdt)?|eth(?:usdt)?|usdt|perpetual|futures|candle|ohlcv|price|entry|exit|stop(?:-loss)?|target|risk|reward(?:\/risk)?|long|short|bias|setup|support|resistance|volume|trend|momentum|liquidity|spread|slippage|position|volatility|breakout|invalidation|timeframe|indicator|funding|backtest|paper)\b/i;
const ROOM_BLOCK_PATTERN = /\b(?:ignore all previous instructions|bypass (?:the )?(?:supervisor|risk gate|safety rules)|override (?:the )?(?:supervisor|risk gate|safety rules)|place (?:a )?(?:real|live) (?:exchange )?orders?|send (?:a )?(?:real|live) (?:exchange )?orders?|guaranteed profit|guaranteed return|risk[- ]free|cannot lose|100% win(?:ning)?(?: rate)?|sure[- ]win)\b|\b(?:reveal|print|expose|leak|show)\b.{0,50}\b(?:api key|secret|password|credentials|access code|system prompt)\b/i;

export function reviewAgentRoomMessage(input) {
  const clean = String(input?.text || "").trim().slice(0, 1800);
  const reasons = [];
  let status = "CLEAR";
  if (input?.providerFailed || !clean) {
    status = "BLOCKED";
    reasons.push("No usable agent response was returned; no reply was fabricated.");
  } else if (ROOM_BLOCK_PATTERN.test(clean)) {
    status = "BLOCKED";
    reasons.push("The post attempted to leave trading-only or paper-only boundaries.");
  } else if (!ROOM_TRADING_TOPIC_PATTERN.test(clean)) {
    status = "BLOCKED";
    reasons.push("The post did not contain a valid trading topic.");
  } else {
    if (!/\bEVIDENCE\s*:/i.test(clean)) {
      status = "FLAGGED";
      reasons.push("No explicit evidence field; treat the opinion as unverified.");
    }
    if (!/\b(?:REPLY|QUESTION|COUNTERARGUMENT|RISK|FOLLOW-UP)\s*:/i.test(clean)) {
      status = "FLAGGED";
      reasons.push("The post did not follow the required peer-discussion format.");
    }
  }
  const visibleText = status === "BLOCKED"
    ? "Message blocked by the Agent Operations Supervisor. " + reasons.join(" ")
    : clean;
  return {
    status,
    reasons,
    text: visibleText,
    notEligibleForTradeApproval: true,
    reviewedBy: "Agent Operations Supervisor",
    reviewMode: "per-message trading-only policy check",
    reviewedAt: new Date().toISOString()
  };
}
