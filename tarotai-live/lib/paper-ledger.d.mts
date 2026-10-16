export type PaperTradeStatus = "PAPER_OPEN" | "PAPER_CLOSE" | "PAPER_STOP" | "PAPER_TARGET";

export type PaperTradeRecord = {
  id: string;
  status?: PaperTradeStatus | string;
  requestId?: string;
  parentTradeId?: string | null;
  [key: string]: any;
};

export type PaperLedgerRequestRecord = {
  action: "OPEN" | "CLOSE";
  trade: PaperTradeRecord;
};

export const PAPER_LEDGER_PERSIST_LUA: string;

export function persistPaperTrade(
  redis: any,
  input: {
    requestId: string;
    action: string;
    trade: PaperTradeRecord;
    parentTradeId?: string;
  }
): Promise<
  | { ok: true; duplicate: boolean; action: "OPEN" | "CLOSE"; trade: PaperTradeRecord }
  | { ok: false; reason: string; storedRecord?: PaperLedgerRequestRecord }
>;

export function readPaperRequestRecord(raw: unknown): PaperLedgerRequestRecord | null;
