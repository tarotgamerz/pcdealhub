# TarotAI Trading Lab — validation matrix

All tests must run with live trading disabled and must never send production orders.

## Market data
- Reject malformed JSON and non-finite OHLCV values.
- Reject unsupported symbols and intervals.
- Reject stale candles before generating a new simulated entry.
- Normalize and validate each order-book side, reject crossed/empty books and invalid sequence IDs.
- Seed a live local depth book from a REST snapshot, bridge the first WebSocket update by update ID, and rebuild on any sequence gap.
- Mark order-flow metrics stale after feed silence; do not label an unsynchronized snapshot as live.
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
- Require a signed, short-lived server gate token tied to symbol, venue, timeframe, closed candle, direction, levels, paper size and risk settings.
- Require a second, shorter-lived execution token after a fresh same-venue order-book check; browser-supplied spread values cannot authorize a paper entry.
- Consume each execution token once using a durable atomic store operation to block token replay; never store raw tokens in the trade ledger.

## Strategy and risk review
- Strategy review and risk review must be separate functions with separate outputs.
- Risk veto wins over strategy approval.
- Require explicit numeric trade-plan fields for entry, stop, target, reward/risk and position quantity before declaring a paper setup candidate.
- Recompute reward/risk from the supplied prices; reject invalid stop geometry, reward/risk below 2R, material mismatch between exit and sizing levels, and position sizing above the configured risk budget.
- Require a fresh same-venue book snapshot for spread and entry-drift checks; fail closed when unavailable or when the spread exceeds the provisional 10 bps ceiling or entry drift exceeds 0.25%.
- Treat the 10 bps spread and 0.25% drift thresholds as provisional paper-research guardrails, not backtested edge claims.
- Reject stale data, risk above configured limit, and excessive spread.
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