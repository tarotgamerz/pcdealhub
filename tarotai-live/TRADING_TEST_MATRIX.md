# TarotAI Trading Lab — validation matrix

All tests must run with live trading disabled and must never send production orders.

## Market data
- Reject malformed JSON and non-finite OHLCV values.
- Reject unsupported symbols and intervals.
- Reject stale candles before generating a new simulated entry.
- Normalize exchange candle order to ascending timestamps and reject duplicates.

## Paper fills
- Validate quantity and price are positive and finite.
- Apply adverse slippage to both buy and sell fills.
- Deduct fees on every fill, including closing fills.
- Test stop-loss and take-profit triggers when a candle crosses a trigger; if both are crossed in one candle, use a conservative stop-first assumption or lower-timeframe replay.
- Never represent a simulated fill as an exchange order.

## Ledger and replay
- Persist each trade with unique ID, timestamp, source candle ID, requested price, fill price, fee, slippage, and reason.
- Replay identical candles and parameters deterministically.
- Verify ledger survives a fresh server instance.
- Fail closed if durable storage is unavailable.

## Strategy and risk review
- Strategy review and risk review must be separate functions with separate outputs.
- Risk veto wins over strategy approval.
- Reject stale data, invalid stop geometry, excessive spread, risk above configured limit, and reward/risk below configured minimum.
- Reviews are deterministic guardrails until independent model agents are explicitly integrated and evaluated.

## Exchange adapters
- Keep Binance demo, Bybit testnet, and OKX demo endpoints separate from production hosts.
- Validate venue response status and response schema before normalization.
- No API secrets in the browser, webhook payload, or chat.
- No order placement in the public market-data adapter.

## TradingView
- Reject missing/incorrect webhook secret.
- Reject invalid symbol/action and malformed payloads.
- Verify signal is durably queued before returning accepted.
- Duplicate alerts must be idempotent before any future execution is considered.

## Release gate
- Run unit tests and production build.
- Smoke-test deployed routes with authentication enabled.
- Do not claim tests passed until actual results are recorded.
- Keep live trading hard-disabled.

## Ensemble walk-forward research
- Score ensemble and current live rules on the same exact closed-candle history and chronological windows.
- Keep the first 55% as historical indicator context; evaluate three consecutive non-overlapping folds across 55–85% and report the final 15% separately.
- Use next-candle-open entry, identical stop/target handling, risk sizing, fees and slippage for both compared strategies.
- Prevent future higher-timeframe candles from entering a signal; test fold boundaries and signal timestamps.
- Report fold metrics and low-sample warnings; no result may automatically enable paper-entry authority or live order execution.
- Treat OHLC-only backtests as incomplete because historical spread, funding, market impact, latency, partial fills and liquidation are not reconstructed.


## Live order-flow shadow observer
- Subscribe only to the selected Binance USDⓈ-M Futures symbol's partial top-20 depth and aggregate-trade streams; never silently change venue.
- Reject malformed, crossed, stale, or wrong-symbol snapshots and non-finite/non-positive trade values.
- Correctly interpret Binance buyer-is-maker flag: maker=true means the aggressor was a seller.
- Show depth-history heatmap and executed-trade bubbles distinctly; never label resting orders as completed transactions.
- Surface freshness and book/trade imbalance; missing/stale streams must display WAIT/UNAVAILABLE.
- Attach a sanitized order-flow snapshot to paper-trade ledger records for later outcome analysis.
- Keep order-flow in shadow mode until out-of-sample paper results demonstrate incremental value; this feature must not directly enable or submit exchange orders.
