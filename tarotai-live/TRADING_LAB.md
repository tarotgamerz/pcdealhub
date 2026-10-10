# TarotAI Futures Lab — integration and test plan

## Current scope

This project is research-first. Live trading is disabled and no endpoint in this milestone places or cancels orders.

- `GET /api/trading/market?symbol=BTCUSDT&interval=15m&limit=100`: reads public USDⓈ-M Futures demo/testnet candles.
- `POST /api/trading/backtest`: authenticated, research-only moving-average crossover baseline. Request JSON: `{"symbol":"BTCUSDT","interval":"15m","fastPeriod":9,"slowPeriod":21,"feeBps":5,"slippageBps":2,"limit":500}`.
- `POST /api/tradingview`: validates a TradingView JSON alert and stores it as `PENDING_REVIEW` in Upstash Redis. It never executes a trade.
- `/trading-desk.html`: UI prototype only; local demo records are not exchange testnet orders.

## Required server-side configuration

Set these in Vercel Project → Settings → Environment Variables, then redeploy:

- `TAROTAI_ACCESS_CODE`: strong private app access code. Required for the backtest route.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`: needed to persist TradingView alert intake.
- `TRADINGVIEW_WEBHOOK_SECRET`: random secret at least 32 characters. Never use an exchange API key as this secret.

Do not commit secrets, paste them into chat, or put them in browser JavaScript. TradingView alert payloads carry the shared webhook secret in JSON because the standard webhook UI sends the alert body; use a dedicated random secret, rotate it if exposed, and do not include exchange credentials in alert payloads.

## TradingView alert payload

Configure the webhook URL as `https://YOUR_PRIVATE_APP_DOMAIN/api/tradingview` and use JSON like:

```json
{
  "secret": "YOUR_RANDOM_WEBHOOK_SECRET",
  "symbol": "BTCUSDT",
  "action": "LONG",
  "timeframe": "15m",
  "strategy": "my-alert-rule",
  "price": 65000
}
```

The endpoint accepts a signal and records it as pending review only. It does not place orders. Test webhook delivery with non-sensitive sample alerts first.

## Platform support plan

1. **Binance USDⓈ-M Futures demo/testnet** — source for public market data and later isolated test-order adapter.
2. **TradingView** — alert webhook intake; TradingView is a signal/charting source, not a general-purpose trading API. Webhook delivery can fail; use an authenticated endpoint and monitor alert status.
3. **Bybit / OKX** — add separate provider adapters only after choosing their demo/sandbox environments and confirming current API requirements. Do not assume Binance-compatible endpoints or payload formats.
4. **Other charting/data sources** — use a normalized signal schema, never allow a source alert to bypass risk checks.

## Next required milestones before calling it a working testnet trading bot

- Build a server-only Binance demo adapter against the current official USDⓈ-M Futures demo API.
- Store credentials only in server environment variables; require the testnet-specific host and reject production hosts in test mode.
- Implement exchange precision/filter validation, leverage/margin mode verification, idempotent client order IDs, order state reconciliation, and stop/close behaviour.
- Add explicit global kill switch and daily loss/order limits enforced server-side.
- Add a paper simulator with candle/tick event replay and a durable ledger.
- Add walk-forward and out-of-sample tests with funding, commissions, slippage, latency, partial fills, and liquidation assumptions.
- Run integration tests against testnet; verify account/position/order state from exchange responses. UI mocks are not sufficient evidence.

## Evaluation checklist

Track net P&L after fees/funding, max drawdown, expectancy, profit factor, win rate, turnover, average slippage, rejected orders, stop execution failures, stale data, and signal-to-order latency. Keep an untouched out-of-sample period. Require a minimum sample size across multiple market regimes; do not infer reliability from a short profitable window.

## Important

This code is a prototype and has not been built or tested against a live Binance testnet account. The backtest is deliberately a toy baseline, not evidence of profitability. No real-money trading is enabled.
