export type DiscussionCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
export type AutomaticMarketDiscussionFocus = {
  topic: string;
  directive: string;
  facts: Record<string, string | number | null>;
};
export function buildAutomaticMarketDiscussionFocus(input?: {
  symbol?: string;
  interval?: string;
  candles?: DiscussionCandle[];
  higherTrend?: string;
  historicalStudy?: Record<string, unknown>;
  technicalScorecard?: Record<string, unknown>;
}): AutomaticMarketDiscussionFocus;
