export interface BinanceApiKeyPermissions {
  enableReading: boolean;
  enableFutures: boolean;
  enableWithdrawals: boolean;
  ipRestrict: boolean;
  enableSpotAndMarginTrading: boolean | null;
  enableMargin: boolean | null;
  enableInternalTransfer: boolean | null;
  permitsUniversalTransfer: boolean | null;
  enableVanillaOptions: boolean | null;
  enableFixApiTrade: boolean | null;
  enableFixReadOnly: boolean | null;
  enablePortfolioMarginTrading: boolean | null;
}

export function parseApiKeyPermissions(payload: unknown): BinanceApiKeyPermissions | null;
