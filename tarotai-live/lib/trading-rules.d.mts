export type OrderSide = "BUY" | "SELL";
export type PositionSide = "LONG" | "SHORT";

export function applySlippage(side: string, price: number, bps: number): number;
export function calculateFee(fillPrice: number, quantity: number, feeBps: number): number;
export function isStale(timestamp: number, now?: number, maxAgeMs?: number): boolean;
export function validateStops(side: PositionSide, entry: number, stop: number, target: number): boolean;
export function resolveStopTarget(
  candle: { open: number; high: number; low: number },
  side: PositionSide,
  stop: number,
  target: number
): { exit: "STOP" | "TARGET"; price: number; ambiguous: boolean } | { exit: null; price: null; ambiguous: false };
export function resolveTargetOnlyObservation(
  candle: { open: number; high: number; low: number },
  side: PositionSide,
  stop: number,
  target: number
): { exit: "TARGET"; price: number; ambiguous: false; stopTouched: false; targetTouched: true } | { exit: null; price: null; ambiguous: boolean; stopTouched: boolean; targetTouched: boolean };
export function validateOrderRequest(input: {
  symbol: string;
  side: string;
  type: string;
  quantity: number;
  price?: number;
  clientOrderId: string;
  venue?: string;
}): string | null;

export const PAPER_MAX_POSITION_EXPOSURE_PCT: 25;
export const PAPER_MAX_PORTFOLIO_EXPOSURE_PCT: 100;
export const PAPER_MAX_OPEN_RISK_PCT: 3;
export const PAPER_MAX_OPEN_POSITIONS: 10;
export const PAPER_MAX_POSITIONS_PER_SYMBOL: 5;
export const PAPER_MAX_DAILY_LOSS_PCT: 3;
export const PAPER_MAX_ENTRIES_PER_UTC_DAY: 50;
export function validatePaperDailyRisk(input: {
  ledger: Array<{
    status?: string;
    createdAt?: string;
    parentTradeId?: string | null;
    pnlNet?: number | string | null;
  }>;
  balance: number;
  now?: number;
}): string | null;
export function calculatePaperQuantity(input: {
  balance: number;
  riskPct: number;
  entry: number;
  stop: number;
  maxExposurePct?: number;
}): number;
export function validatePaperExposure(input: {
  balance: number;
  riskPct: number;
  entry: number;
  stop: number;
  quantity: number;
  existingExposure?: number;
  maxExposurePct?: number;
  maxTotalExposurePct?: number;
  existingRisk?: number;
  maxPortfolioRiskPct?: number;
}): string | null;
