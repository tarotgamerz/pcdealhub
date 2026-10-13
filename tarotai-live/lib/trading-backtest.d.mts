export type BacktestCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  closeTime?: number;
};

export type BacktestOptions = {
  fastPeriod?: number;
  slowPeriod?: number;
  feeBps?: number;
  slippageBps?: number;
  startIndex?: number | null;
  endIndex?: number | null;
};

export function validateBacktestCandles(candles: BacktestCandle[]): true;
export function calculateSma(values: number[], period: number): Array<number | null>;
export function runSmaCrossoverBacktest(
  candles: BacktestCandle[],
  options?: BacktestOptions
): Record<string, unknown>;
export function getIntervalMs(interval: string): number | null;
