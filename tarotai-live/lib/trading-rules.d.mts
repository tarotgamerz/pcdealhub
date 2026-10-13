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
export function validateOrderRequest(input: {
  symbol: string;
  side: string;
  type: string;
  quantity: number;
  price?: number;
  clientOrderId: string;
  venue?: string;
}): string | null;
