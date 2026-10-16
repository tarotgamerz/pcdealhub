export type MarketCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  closeTime?: number;
};

export type SpecialistReportParse = {
  fields: Record<string, string>;
  bias: "LONG" | "SHORT" | "WAIT";
  veto: boolean;
  biasDeclared: boolean;
  vetoDeclared: boolean;
  complete: boolean;
  missing: string[];
};

export type TechnicalScorecheck = {
  key: string;
  label: string;
  points: number;
  passed: boolean;
  detail: string;
};

export type TechnicalScorecardSide = {
  score: number;
  maxScore: number;
  checks: TechnicalScorecheck[];
};

export type TechnicalScorecard = {
  available: boolean;
  version: string;
  label: string;
  isProbability: false;
  status: "WAIT" | "READY_FOR_REVIEW";
  reason: string;
  evidenceLeader?: "LONG" | "SHORT" | "MIXED";
  long: TechnicalScorecardSide;
  short: TechnicalScorecardSide;
  diagnostics: Record<string, unknown>;
};

export function computeTechnicalScorecard(options?: {
  candles?: MarketCandle[];
  interval?: string;
  higherTrend?: string;
  historicalStudy?: Record<string, unknown>;
  lastClosedCandleAgeMs?: number;
}): TechnicalScorecard;

export function parseSpecialistReport(text: string): SpecialistReportParse;

export function auditSpecialistResults(
  results: Array<Record<string, any>>,
  market?: Record<string, any>,
  history?: Record<string, any>
): {
  veto: boolean;
  issues: string[];
  longs: number;
  shorts: number;
  text: string;
  model: string;
};
