const DIRECTIONAL_ROLES = ["market", "entry", "exits", "sizing", "discipline"];

export function evaluateTradeReadiness(results, market, intervalMs) {
  const blockers = [];
  const safeResults = Array.isArray(results) ? results : [];
  const byRole = new Map(safeResults.map((result) => [result?.role, result]));
  const ageSeconds = Number(market?.lastClosedCandleAgeSeconds);
  const interval = Number(intervalMs);

  if (safeResults.length !== 8 || new Set(safeResults.map((r) => r?.role)).size !== 8) {
    blockers.push("All eight unique agent reports are required.");
  }
  if (safeResults.some((r) => !r || r.ok !== true)) blockers.push("One or more agents failed.");
  if (safeResults.some((r) => r?.fallback || r?.providerStatus === "degraded" || String(r?.model || "").includes("deterministic-fallback"))) {
    blockers.push("AI provider degraded or deterministic fallback used; rerun with healthy provider.");
  }
  if (safeResults.some((r) => r?.veto === true)) blockers.push("At least one agent or the supervisor raised a veto.");
  const book = market?.orderBookSnapshot;
  if (book) {
    const bookAgeMs = Number(book.ageMs);
    const spreadBps = Number(book.spreadBps);
    if (!Number.isFinite(bookAgeMs) || bookAgeMs < 0 || bookAgeMs > 15_000) {
      blockers.push("The supplied order-book snapshot is stale or cannot be timestamp-validated.");
    }
    if (!Number.isFinite(spreadBps) || spreadBps < 0) {
      blockers.push("The supplied order-book spread is invalid.");
    } else if (spreadBps > 10) {
      blockers.push("Displayed spread exceeds the provisional 10 bps paper-research ceiling.");
    }
  }
  if (!Number.isFinite(ageSeconds) || !Number.isFinite(interval) || interval <= 0 || ageSeconds * 1000 > interval * 2 + 60_000) {
    blockers.push("Latest closed candle is stale or its age cannot be verified.");
  }

  const directional = DIRECTIONAL_ROLES.map((role) => byRole.get(role));
  if (directional.some((r) => !r)) {
    blockers.push("A required directional specialist report is missing.");
  } else {
    const votes = directional.map((r) => String(r.bias || "WAIT").toUpperCase());
    if (votes.some((vote) => !["LONG", "SHORT", "WAIT"].includes(vote))) {
      blockers.push("A directional specialist returned an invalid vote.");
    }
    if (votes.some((vote) => vote === "WAIT")) {
      blockers.push("At least one required specialist recommends WAIT.");
    }
    if (new Set(votes).size !== 1) blockers.push("Directional specialists disagree; no trade is approved.");
  }

  const votes = directional.map((r) => String(r?.bias || "WAIT").toUpperCase());
  const unanimousDirection = votes.length === DIRECTIONAL_ROLES.length && votes[0] !== "WAIT" &&
    ["LONG", "SHORT"].includes(votes[0]) && votes.every((vote) => vote === votes[0]);
  const approved = blockers.length === 0 && unanimousDirection;

  return {
    status: approved ? "PAPER_SETUP_CANDIDATE" : "WAIT",
    recommendation: approved ? votes[0] : "WAIT",
    approved,
    blockers: [...new Set(blockers)],
    directionalVotes: Object.fromEntries(DIRECTIONAL_ROLES.map((role) => [role, byRole.get(role)?.bias || "MISSING"])),
    liquiditySnapshot: book ? { available: true, ageMs: Number(book.ageMs), spreadBps: Number(book.spreadBps), provisionalSpreadCeilingBps: 10 } : { available: false, note: "No fresh same-venue order-book snapshot was available; no liquidity claim is made." },
    policy: "Conservative deterministic gate; this is not a calibrated win probability and never authorizes live orders."
  };
}
