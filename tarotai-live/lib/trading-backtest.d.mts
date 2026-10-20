export type BacktestCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  closeTime?: number;
};

export type FundingRate = {
  time: number;
  rate: number;
  markPrice: number;
};

export type BacktestOptions = {
  fastPeriod?: number;
  slowPeriod?: number;
  feeBps?: number;
  slippageBps?: number;
  startIndex?: number | null;
  endIndex?: number | null;
  fundingRates?: FundingRate[] | null;
};

export function validateBacktestCandles(candles: BacktestCandle[]): true;
export function validateFundingRates(fundingRates: FundingRate[]): FundingRate[];
export function calculateFundingPnlFraction(
  side: "LONG" | "SHORT",
  fundingRate: number,
  markPrice: number,
  entryPrice: number
): number;
export function calculateSma(values: number[], period: number): Array<number | null>;
export function runSmaCrossoverBacktest(
  candles: BacktestCandle[],
  options?: BacktestOptions
): Record<string, unknown>;
export function getIntervalMs(interval: string): number | null;

export type BacktestEvidenceStatus = "INSUFFICIENT_EVIDENCE" | "DO_NOT_ADVANCE" | "PAPER_FORWARD_TEST_ONLY";
export type BacktestEvidenceOptions = {
  fundingHistoryVerified?: boolean;
};

export function assessBacktestEvidence(
  testResults: { closedTrades: number; netReturnPct: number; profitFactor: number | null; maxDrawdownPct: number },
  holdoutSlices: Array<{ results: { closedTrades: number; netReturnPct: number } | null }>,
  options?: BacktestEvidenceOptions
): {
  status: BacktestEvidenceStatus;
  mayStartPaperForwardTest: boolean;
  mayPlaceLiveOrders: false;
  fundingHistoryVerified: boolean;
  thresholds: Record<string, number>;
  observed: Record<string, number | null>;
  reasons: string[];
};
