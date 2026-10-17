const DIRECTIONAL_ROLES = ["market", "entry", "exits", "sizing", "discipline"];
const MAX_ORDERBOOK_AGE_MS = 15_000;
const MAX_SPREAD_BPS = 10;
const MAX_ENTRY_DRIFT_PCT = 0.25;
const MIN_REWARD_RISK = 2;

function parseTradePlan(reportText) {
  const text = typeof reportText === "string" ? reportText : "";
  const match = text.match(/^\s*(?:[-*]\s*)?(?:\*\*)?TRADE_PLAN(?:\*\*)?\s*:\s*([^\r\n]+)$/im);
  if (!match) return { present: false };
  const line = match[1];
  const read = (key) => {
    const field = line.match(new RegExp("(?:^|[;,|\\s])" + key + "\\s*=\\s*(NA|N/A|[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][-+]?\\d+)?)", "i"));
    if (!field || /^N\/?A$/i.test(field[1])) return null;
    const value = Number(field[1]);
    return Number.isFinite(value) ? value : null;
  };
  return {
    present: true,
    entry: read("entry"),
    stop: read("stop"),
    target: read("target"),
    rr: read("rr"),
    quantity: read("quantity"),
    driftPct: read("drift_pct")
  };
}

const finitePositive = (value) => Number.isFinite(value) && value > 0;
const relativeDifference = (left, right) => Math.abs(left - right) / Math.max(Math.abs(left), Math.abs(right), Number.EPSILON);

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
  if (!Number.isFinite(ageSeconds) || !Number.isFinite(interval) || interval <= 0 || ageSeconds * 1000 > interval * 2 + 60_000) {
    blockers.push("Latest closed candle is stale or its age cannot be verified.");
  }

  const book = market?.orderBookSnapshot;
  if (!book) {
    blockers.push("No fresh same-venue order-book snapshot is available; current spread and entry drift are unverified.");
  } else {
    const bookAgeMs = Number(book.ageMs);
    const spreadBps = Number(book.spreadBps);
    if (!Number.isFinite(bookAgeMs) || bookAgeMs < 0 || bookAgeMs > MAX_ORDERBOOK_AGE_MS) {
      blockers.push("The supplied order-book snapshot is stale or cannot be timestamp-validated.");
    }
    if (!Number.isFinite(spreadBps) || spreadBps < 0) {
      blockers.push("The supplied order-book spread is invalid.");
    } else if (spreadBps > MAX_SPREAD_BPS) {
      blockers.push("Displayed spread exceeds the provisional 10 bps paper-research ceiling.");
    }
  }

  const directional = DIRECTIONAL_ROLES.map((role) => byRole.get(role));
  const votes = directional.map((r) => String(r?.bias || "WAIT").toUpperCase());
  if (directional.some((r) => !r)) {
    blockers.push("A required directional specialist report is missing.");
  } else {
    if (votes.some((vote) => !["LONG", "SHORT", "WAIT"].includes(vote))) {
      blockers.push("A directional specialist returned an invalid vote.");
    }
    if (votes.some((vote) => vote === "WAIT")) {
      blockers.push("At least one required specialist recommends WAIT.");
    }
    if (new Set(votes).size !== 1) blockers.push("Directional specialists disagree; no trade is approved.");
  }

  const exitsPlan = parseTradePlan(byRole.get("exits")?.text);
  const sizingPlan = parseTradePlan(byRole.get("sizing")?.text);
  let riskGeometry = null;
  if (!exitsPlan.present || ![exitsPlan.entry, exitsPlan.stop, exitsPlan.target, exitsPlan.rr].every(finitePositive)) {
    blockers.push("Stop/target agent did not provide a complete numeric entry, stop, target and reward/risk plan.");
  } else {
    const entry = exitsPlan.entry;
    const stop = exitsPlan.stop;
    const target = exitsPlan.target;
    const riskDistance = Math.abs(entry - stop);
    const rewardDistance = Math.abs(target - entry);
    const calculatedRR = riskDistance > 0 ? rewardDistance / riskDistance : NaN;
    const geometryValid = votes[0] === "LONG"
      ? stop < entry && target > entry
      : votes[0] === "SHORT" && target < entry && entry < stop;
    if (!geometryValid) blockers.push("Entry, stop and target geometry conflicts with the unanimous direction.");
    if (!Number.isFinite(calculatedRR) || calculatedRR < MIN_REWARD_RISK) {
      blockers.push("Calculated reward/risk from the supplied prices is below 2R.");
    }
    if (Math.abs(exitsPlan.rr - calculatedRR) > 0.25) blockers.push("The stated reward/risk does not match the entry, stop and target prices.");
    if (!sizingPlan.present || ![sizingPlan.entry, sizingPlan.stop, sizingPlan.target, sizingPlan.quantity].every(finitePositive)) {
      blockers.push("Position-sizing agent did not provide matching numeric levels and a positive quantity.");
    } else {
      if (relativeDifference(entry, sizingPlan.entry) > 0.001 ||
          relativeDifference(target, sizingPlan.target) > 0.001 ||
          Math.abs(stop - sizingPlan.stop) > Math.max(riskDistance * 0.1, entry * 0.0001)) {
        blockers.push("Position-sizing levels materially disagree with the stop/target plan.");
      }
    }

    const paper = market?.paperTradeContext;
    const equity = Number(paper?.paperEquity);
    const riskPct = Number(paper?.riskPct);
    if (!Number.isFinite(equity) || equity < 100 || equity > 10_000_000 ||
        !Number.isFinite(riskPct) || riskPct < 0.1 || riskPct > 1) {
      blockers.push("Valid paper equity and risk from 0.1% through 1% are required before quantity approval.");
    } else if (finitePositive(riskDistance) && finitePositive(entry) && sizingPlan.present && finitePositive(sizingPlan.quantity)) {
      const riskBudget = equity * riskPct / 100;
      const maxQuantity = Math.min(riskBudget / riskDistance, equity / entry);
      if (sizingPlan.quantity > maxQuantity * 1.001) {
        blockers.push("Position quantity exceeds the configured paper risk budget or unlevered notional cap.");
      }
      const bookMid = Number(book?.midPrice);
      if (!finitePositive(bookMid)) {
        blockers.push("A valid same-venue mid-price is required to verify entry drift.");
      } else {
        const driftPct = Math.abs(bookMid - entry) / entry * 100;
        if (driftPct > MAX_ENTRY_DRIFT_PCT) {
          blockers.push("Current mid-price has drifted more than the provisional 0.25% entry-chase limit.");
        }
      }
      riskGeometry = {
        entry, stop, target, calculatedRewardRisk: Number(calculatedRR.toFixed(3)),
        quantity: sizingPlan.quantity, cashRisk: Number((sizingPlan.quantity * riskDistance).toFixed(4)),
        configuredRiskBudget: Number(riskBudget.toFixed(4)),
        estimatedEntryDriftPct: finitePositive(bookMid) ? Number((Math.abs(bookMid - entry) / entry * 100).toFixed(4)) : null
      };
    }
  }

  const unanimousDirection = votes.length === DIRECTIONAL_ROLES.length && votes[0] !== "WAIT" &&
    ["LONG", "SHORT"].includes(votes[0]) && votes.every((vote) => vote === votes[0]);
  const approved = blockers.length === 0 && unanimousDirection;

  return {
    status: approved ? "PAPER_SETUP_CANDIDATE" : "WAIT",
    recommendation: approved ? votes[0] : "WAIT",
    approved,
    blockers: [...new Set(blockers)],
    directionalVotes: Object.fromEntries(DIRECTIONAL_ROLES.map((role) => [role, byRole.get(role)?.bias || "MISSING"])),
    riskGeometry,
    liquiditySnapshot: book ? { available: true, ageMs: Number(book.ageMs), spreadBps: Number(book.spreadBps), provisionalSpreadCeilingBps: MAX_SPREAD_BPS } : { available: false, note: "No fresh same-venue order-book snapshot was available; no liquidity claim is made." },
    policy: "Conservative deterministic paper gate, requiring numeric risk geometry, matching sizing, fresh same-venue spread/depth and no-chase checks. Not a calibrated win probability and never authorizes live orders."
  };
}
