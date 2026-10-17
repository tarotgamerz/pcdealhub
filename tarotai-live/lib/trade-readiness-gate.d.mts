export type Direction = "LONG" | "SHORT" | "WAIT";
export type TradeReadinessResult = {
  status: "PAPER_SETUP_CANDIDATE" | "WAIT";
  recommendation: Direction;
  approved: boolean;
  blockers: string[];
  directionalVotes: Record<string, string>;
  riskGeometry: null | {
    entry: number;
    stop: number;
    target: number;
    calculatedRewardRisk: number;
    quantity: number;
    cashRisk: number;
    configuredRiskBudget: number;
    estimatedEntryDriftPct: number | null;
  };
  liquiditySnapshot:
    | { available: true; ageMs: number; spreadBps: number; provisionalSpreadCeilingBps: number }
    | { available: false; note: string };
  policy: string;
};
export function evaluateTradeReadiness(
  results: Array<Record<string, unknown>>,
  market: {
    lastClosedCandleAgeSeconds?: number;
    orderBookSnapshot?: Record<string, unknown> | null;
    paperTradeContext?: { paperEquity?: number | null; riskPct?: number | null };
  },
  intervalMs: number
): TradeReadinessResult;
