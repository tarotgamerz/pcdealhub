export type OrderSide = "BUY" | "SELL";
export type PositionSide = "LONG" | "SHORT";

export function applySlippage(side: OrderSide, price: number, bps: number): number;
export function calculateFee(fillPrice: number, quantity: number, feeBps: number): number;
export function isStale(timestamp: number, now?: number, maxAgeMs?: number): boolean;
export function validateStops(side: PositionSide, entry: number, stop: number, target: number): boolean;
export function resolveStopTarget(
  candle: { open: number; high: number; low: number },
  side: PositionSide,
  stop: number,
  target: number
): { exit: "STOP" | "TARGET" | null; price: number | null; ambiguous: boolean };
export function validateOrderRequest(input: {
  symbol: string;
  side: OrderSide;
  type: string;
  quantity: number;
  price?: number;
  clientOrderId: string;
  venue?: string;
}): string | null;
