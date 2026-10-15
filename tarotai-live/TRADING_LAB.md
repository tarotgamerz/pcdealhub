# TarotAI Futures Lab — implementation and validation

## Safety boundary

Live trading is disabled by design in this project. Order endpoints are hard-wired to Binance Futures demo, Bybit testnet, or OKX simulated trading and require an explicit `confirmTestnetOrder: true` request plus server-side demo credentials. Never reuse production credentials. Never paste keys into chat or the browser.

## Implemented routes

- `GET /api/exchanges/market?venue=binance|bybit|okx&symbol=BTCUSDT&interval=15m&limit=100`: authenticated, read-only market-data adapter. It validates exchange response schemas, normalizes candle order, and reports stale-data status.
- `POST /api/trading/backtest`: authenticated research-only SMA crossover backtest with fee/slippage inputs. It does not place orders. Funding, liquidation, market impact and true independent walk-forward validation remain limitations.
- `GET /api/trading/paper`: authenticated persistent ledger/replay reader. Requires Upstash Redis.
- `POST /api/trading/paper`: `REPLAY` stores validated market candles; `OPEN` and `CLOSE` add paper ledger events; `STOP_CHECK` checks candle high/low against open paper positions and uses conservative stop-first handling when stop and target are both crossed. Paper entries require fresh marketTime, positive quantity/price, costs in bounds and valid stop/target geometry.
- `POST /api/trading/review`: separate deterministic StrategyReview and IndependentRisk outputs. This is guardrail logic, not two independent LLM agents and not proof of strategy edge.
- `POST /api/tradingview`: authenticated-by-secret TradingView webhook intake with 24-hour duplicate suppression; signals are queued as pending review only.
- `GET /api/tradingview/signals`: authenticated TradingView queue monitor. Requires Upstash Redis.
- `POST /api/trading/testnet-order` and `GET /api/trading/testnet-order-status`: Binance USDⓈ-M Futures demo order submit and status reconciliation.
- `POST /api/trading/bybit-testnet-order` and `GET /api/trading/bybit-testnet-order-status`: Bybit linear testnet submit/status adapter.
- `POST /api/trading/okx-demo-order` and `GET /api/trading/okx-demo-order-status`: OKX simulated-trading submit/status adapter. For OKX swaps, size is in contracts, not base coin.
- `/trading-desk.html`: dashboard connects to private auth, market data, backtest, risk review, paper ledger, TradingView monitor and exchange demo order/status routes.

## Required server environment

Set only in Vercel Project → Settings → Environment Variables, then redeploy:

- `TAROTAI_ACCESS_CODE`: strong private app access code. Session cookie is signed, HTTP-only, secure and expires after eight hours.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`: persistent paper ledger, market replays and TradingView signal queue.
- `TRADINGVIEW_WEBHOOK_SECRET`: random secret of at least 32 characters; never use an exchange key as this secret.
- `BINANCE_TESTNET_API_KEY` and `BINANCE_TESTNET_API_SECRET`: keys created specifically for Binance USDⓈ-M Futures demo.
- `BYBIT_TESTNET_API_KEY` and `BYBIT_TESTNET_API_SECRET`: Bybit testnet keys.
- `OKX_DEMO_API_KEY`, `OKX_DEMO_API_SECRET`, and `OKX_DEMO_API_PASSPHRASE`: OKX demo trading credentials.

Never commit these values or place them in browser JavaScript. Testnet credentials are required only for that venue's order submit/status endpoints; public market data uses no credentials.

## TradingView alert setup

Use `https://YOUR_PRIVATE_APP_DOMAIN/api/tradingview` as webhook URL. Example body:

```json
{
  "secret": "YOUR_RANDOM_WEBHOOK_SECRET",
  "symbol": "BTCUSDT",
  "action": "LONG",
  "timeframe": "15m",
  "strategy": "my-alert-rule",
  "price": 65000,
  "alertId": "unique-alert-id"
}
```

The endpoint queues a signal for review only. It never executes an order. Use a unique `alertId` for each intended alert; duplicate alerts are ignored for 24 hours.

## Test commands and release gate

- `npm run test:trading`: Node's built-in test runner for adverse slippage, fee calculations, stale-data detection, stop geometry, conservative stop-first handling, gap-through-stop behavior and invalid fill inputs.
- `npm run build`: runs those tests before `next build`.
- Exchange integration must still be tested using configured demo keys. A successful build is not proof that the exchange accepts an order.
- Verify returned order ID, then call the matching status endpoint and reconcile the returned status/filled quantity before retrying. After a timeout, do not blindly resubmit; query the exchange first to avoid duplicates.
- Do not declare paper-trading results valid until ledger persistence, candle replay, stale-data vetoes, fee/slippage accounting, stop/target handling, and rejection cases have been exercised end-to-end.

## Known limitations

- The SMA backtest is a toy baseline, not a profitable strategy claim. It does not fully model funding, liquidation, partial fills, intrabar stop fills, latency or market impact, and its train/test metrics are approximate rather than a clean independent walk-forward protocol.
- The risk/strategy review endpoints are deterministic guardrails, not autonomous independent LLM agents.
- Exchange order routes validate basic inputs and exchange acknowledgements but do not yet fetch and enforce each venue's instrument tick/lot filters, reconcile all partial fills automatically, or implement a global server-side daily-loss kill switch.
- Paper ledger events are persistent when Upstash is configured; without it, writes fail closed. Exchange demo credentials and Redis are manual configuration requirements.
- Live trading remains disabled; do not add production exchange hosts or production credentials to these routes.


## Strategy ensemble upgrade — shadow phase

The trading desk includes a deterministic, three-family strategy ensemble in shadow mode: higher-timeframe trend following, breakout/momentum, and range-only mean reversion. It evaluates the same verified closed candles as the live chart, requires at least two unopposed directional votes to emit a shadow LONG/SHORT suggestion, and withholds votes for stale/invalid data. Rule agreement is not a calibrated probability and is not evidence of profitability. In this phase it is deliberately excluded from entry authority: existing chart approvals and server-side risk gates remain in force until a separate fee/slippage-aware, chronological walk-forward benchmark validates any strategy promotion.

This is not DRL. There are no trained policy weights or online learning claims in this change.
