export type MarketPatternCandle = {
  time: number; open: number; high: number; low: number; close: number;
  volume?: number; closeTime?: number;
};
export type HistoricalPatternExample = {
  time: number; close: number; pattern: string; distance: number; similarityPct: number;
  forwardReturnPct: number; outcome: "UP" | "DOWN" | "FLAT"; horizon: number; candleEndTime: number;
};
export type HistoricalPatternStudy = {
  ready: boolean; reason: string; symbolTimeframe?: string; horizon?: number; horizonLabel?: string;
  sampleCount: number; positiveSharePct: number | null; negativeSharePct: number | null;
  averageReturnPct: number | null; medianReturnPct: number | null; sideBias?: "LONG" | "SHORT" | "NEUTRAL";
  examples: HistoricalPatternExample[];
  current?: {time:number;close:number;pattern:string;rsi:number;atrRatio:number};
};
export function findSimilarCases(
  candles: MarketPatternCandle[], interval: string,
  options?: { horizon?: number; maxExamples?: number; maxDistance?: number }
): HistoricalPatternStudy;
