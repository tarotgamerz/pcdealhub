export interface ForecastCandle {
  openTime?: number;
  open?: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime?: number;
}

export type ForecastDirection = "up" | "down" | "sideways";

export interface ForecastResult {
  symbol: string | null;
  direction: ForecastDirection;
  lastPrice: number;
  projectedPrice: number;
  projectedChangePct: number;
  horizonCandles: number;
  confidenceScore: number;
  confidenceMeaning: string;
  indicators: {
    ema9: number;
    ema21: number;
    regressionSlope: number;
    realizedVolatility: number;
    recentRangePct: number;
    latestVolumeVs20CandleMean: number;
  };
  invalidation: string;
  limitations: string[];
}

/**
 * Creates a bounded, candle-only forecast heuristic.
 * The confidence score is a strength score, not a calibrated probability.
 */
export declare function buildForecast(
  input: ForecastCandle[],
  horizon?: number
): ForecastResult;
