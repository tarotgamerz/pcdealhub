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
  strategyMode?: "live-agent-rules" | "strategy-ensemble";
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


export type WalkForwardSummary = {
  available: boolean;
  foldCount?: number;
  initialBalancePerFold?: number;
  closedTrades?: number;
  winningTrades?: number;
  losingTrades?: number;
  meanFoldReturnPct?: number;
  positiveFolds?: number;
  sumSegmentNetPnlUSDT?: number;
  totalFeesUSDT?: number;
  winRatePct?: number;
  profitFactor?: number | null;
  worstFoldDrawdownPct?: number;
  warnings?: string[];
  reason?: string;
};

export type WalkForwardStrategyResult = {
  available: boolean;
  mode?: "RESEARCH_ONLY_NO_ORDERS";
  method?: string;
  sample?: Record<string, number>;
  assumptions?: Record<string, unknown>;
  liveAgentRules?: { strategyMode: "live-agent-rules"; walkForward: WalkForwardSummary };
  ensemble?: { strategyMode: "strategy-ensemble"; walkForward: WalkForwardSummary };
  folds?: Array<Record<string, unknown>>;
  finalHoldout?: Record<string, unknown>;
  comparison?: {
    verdict: string;
    meanFoldReturnDeltaPctPoints: number;
    worstFoldDrawdownDeltaPctPoints: number;
    minimumTradesPerStrategyForScreen: number;
    automatedPromotionAllowed: false;
    note: string;
  };
  warnings?: string[];
  minimumHistory?: number;
  candles?: number;
  reason?: string;
};

export function runWalkForwardStrategyComparison(
  mainCandles: LiveAgentCandle[],
  higherCandles: LiveAgentCandle[],
  options?: LiveAgentBacktestOptions
): WalkForwardStrategyResult;
