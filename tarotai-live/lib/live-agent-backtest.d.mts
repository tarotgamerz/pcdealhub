export type LiveAgentCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
};

export type LiveAgentBacktestOptions = {
  initialBalance?: number;
  riskPct?: number;
  feeBps?: number;
  slippageBps?: number;
  maxPositionExposurePct?: number;
  maxPortfolioExposurePct?: number;
  maxEntryDriftPct?: number;
  fromIndex?: number;
  endIndex?: number;
  signalStartIndex?: number;
};

export function evaluateLiveAgentSignal(
  mainCandles: LiveAgentCandle[],
  higherCandles: LiveAgentCandle[],
  index: number
): Record<string, unknown>;

export function runLiveAgentStrategyBacktest(
  mainCandles: LiveAgentCandle[],
  higherCandles: LiveAgentCandle[],
  options?: LiveAgentBacktestOptions
): Record<string, unknown>;
