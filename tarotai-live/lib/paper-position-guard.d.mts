export const PAPER_OPEN_CLAIM_TTL_SECONDS: number;
export interface PaperOpenSlotClaim { claimed: boolean; key: string | null; }
export function claimPaperOpenSlot(redis: { set(key: string, value: string, options: { ex: number; nx: true }): Promise<unknown> }, symbol: string): Promise<PaperOpenSlotClaim>;
