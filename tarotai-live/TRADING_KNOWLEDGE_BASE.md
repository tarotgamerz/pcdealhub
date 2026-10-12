# TarotAI Trading Knowledge Base
Version: 1.0
Purpose: evidence-grounded research and safer systematic crypto/futures analysis. This is a curated working reference, not "all knowledge on the internet" and not proof that any strategy is profitable.

## Core operating doctrine
1. Treat every setup as a probabilistic hypothesis, never certainty. The goal is positive expectancy after costs and acceptable drawdown, not a high-looking win rate.
2. Use current, timestamped exchange data. Confirm symbol, venue, contract type, timeframe, candle ordering, closed-candle status, freshness, gaps, and response schema before analysis. Never infer a live price from an embed, stale cache, or a screenshot alone.
3. Use closed candles for signal generation by default. Live/incomplete candles can change and create repainting; if using them, label the signal provisional.
4. Build context top-down: higher-timeframe trend/regime -> local structure/support/resistance -> setup trigger -> entry/invalidating stop -> target/position size -> execution costs.
5. Compare at least two plausible hypotheses (long, short, no-trade). Prefer WAIT if data is missing, regime is unclear, reward/risk is poor, or evidence conflicts.
6. Never treat indicators as independent votes when they are derived from the same prices. EMA, MACD, RSI and momentum overlap; avoid double-counting them.
7. Explain a concise, auditable rationale and list what would invalidate it. Do not expose private chain-of-thought. Show evidence, key checks, confidence calibration, and uncertainty.
8. Never promise returns, a specific win rate, or guaranteed prediction. Do not recommend risking money a user cannot afford to lose. No live order execution unless explicitly implemented, permissioned, and separately confirmed; current TarotAI trading routes are research/paper/testnet oriented.

## Market data and features
- OHLCV candles: time, open, high, low, close, volume; ensure chronological order and valid OHLC constraints. Exchange klines are identified by open time. Remove the still-open bar when using closed-bar strategies.
- Streaming: WebSocket streams are better for continuous updates than rapid REST polling. Reconnect safely, handle 24-hour connection lifetimes where applicable, sequence gaps, stale data, duplicate events and clock drift. REST snapshots can seed/repair streams.
- Contract metadata: distinguish spot, USD-margined perpetuals, coin-margined contracts, expiry futures, and venue-specific symbols. Verify tick size, quantity step, min quantity/notional, contract multiplier, funding schedule, mark/index/last price semantics and liquidation rules.
- Volume: compare volume to a rolling baseline (e.g., relative volume) and use exchange-specific volume units carefully. A breakout without participation may be weaker; volume is not a guarantee.
- Futures context when available: funding rate, open interest change, basis, mark/index deviation, liquidation bursts, spread, order-book depth/imbalance. These can be noisy/manipulated; never use a single metric as a standalone signal. OI rising with price rising can be consistent with new positioning but cannot identify participant intent alone.
- Data source health: show source exchange, server fetch time, last candle time, data age, stale flag, closed/provisional state, and fallback venue. Do not silently blend different venues' prices into one candle series.

## Strategy families to test, not blindly trust
### Trend / time-series momentum
Hypothesis: price trends can persist across horizons. Use higher-timeframe trend filters and a slower trend signal to avoid over-trading noise. Research finds historical trend-following evidence across diversified futures, but this does not guarantee that a short-horizon crypto implementation will work. Fast crossover alone is a weak, lagging trigger.
### Breakout and pullback
Define swing highs/lows and range boundaries mechanically before the signal. Require a closed-bar close beyond a level; optionally require relative volume, higher-timeframe alignment, or a retest. Distinguish breakout from wick-only sweep. Use the range/ATR to define invalidation; avoid entering after price has already travelled too far.
### Mean reversion
Hypothesis: unusually extended short-term moves sometimes revert, especially in range-bound regimes. Test separately from trend-following and disable or alter it in strong trends. RSI overbought/oversold is context, not an automatic sell/buy.
### Volatility/regime filters
Estimate ATR/realized volatility and classify trend vs range, low vs high volatility, and expansion vs contraction. Position size should shrink as stop distance/volatility rises. Avoid fragile thresholds tuned to a tiny sample.
### Multi-timeframe confluence
Use a slower timeframe for directional bias, a middle timeframe for structure, and a faster timeframe for trigger. The timeframes should match intended holding period; higher timeframe data must be aligned without looking ahead.
### Order flow and derivatives features
Order book imbalance, funding, open interest and liquidations can provide context if fresh and trustworthy, but short-lived order-book signals are sensitive to spoofing, latency, venue fragmentation and sampling. Require robust data and test incremental value over a price-only baseline.

## Risk mathematics
- Trade expectancy: E = P(win) * average_win - P(loss) * average_loss - average transaction costs, expressed in consistent units. Include funding and slippage where applicable.
- Reward/risk: R = (target - entry)/(entry - stop) for a long; reverse distances for a short. A nominal 2R target does not make a trade good unless the win/loss distribution and costs support positive expectancy.
- Risk budget: risk amount = account equity * chosen risk fraction. Position quantity is approximately risk amount / absolute entry-to-stop distance per unit, adjusted for contract multiplier, fees, and lot step. A common conservative research starting point is 0.25%-0.5% account equity at risk per trade, but user circumstances and product rules differ; never assume it is suitable.
- Leverage changes margin and liquidation exposure, not the underlying stop distance or strategy edge. High leverage can liquidate a position before the planned stop due to margin/mark-price mechanics.
- Stops: place beyond the level that invalidates the thesis, accounting for noise and volatility. ATR can help scale the buffer but is not a magic constant. Stops may slip or gap; stop-market orders do not guarantee a fill price.
- Portfolio limits: cap aggregate open risk and correlated exposure; define daily/weekly loss limits, max drawdown response, cooldown after repeated losses, and a kill switch. Avoid martingale, loss-chasing, and doubling after losses.
- Execution: estimate maker/taker fees, spread, slippage, funding, latency, partial fills and market impact. A strategy with gross edge may be negative net of costs.

## Backtesting and validation protocol
1. Specify rules and parameters before testing. Record every variant tried; do not pick the best result from hundreds of experiments without multiple-testing corrections.
2. Build clean chronological data and explicitly handle gaps, delisted/changed instruments, contract rolls, funding and symbol changes.
3. Prevent look-ahead: signals use only information available at decision time; execute no earlier than the next realistically tradable tick/bar. Avoid same-close fills unless actually executable.
4. Split by time: development/train -> validation -> untouched out-of-sample test. Use rolling/anchored walk-forward evaluation across multiple regimes. Keep a final holdout untouched until design is frozen.
5. Model fees on entry and exit, bid-ask spread, slippage, funding, latency and conservative fills. For stop/target both touched within one OHLC candle, use conservative stop-first handling unless lower-resolution data establishes order.
6. Report trade count, net expectancy, win rate, average win/loss, profit factor, net return, Sharpe/Sortino with caveats, max drawdown, exposure, turnover, holding time, fees/funding, long vs short results, and per-regime performance. Include benchmark and buy-and-hold where appropriate.
7. Test parameter sensitivity and neighboring settings; if a tiny parameter change destroys performance, treat it as fragile. Use bootstrap/Monte Carlo and probability-of-backtest-overfitting methods when feasible.
8. Paper trade forward with live data before real money. Compare predicted vs actual fills and record every signal, including signals skipped, to prevent selection bias.
9. A backtest that looks good is not validated if it uses stale/incomplete data, ignores costs, leaks future data, or tests only one market regime.

## Chart signal contract
Every visual setup must carry:
- symbol, venue, product/contract type, timeframe
- candle source and timestamp; data age; closed vs provisional status
- direction LONG / SHORT / WAIT
- setup type and objectively checked conditions
- planned entry or entry trigger (not an assumed fill), stop/invalidating level, target(s), estimated R multiple
- confidence as calibrated/validated probability only if supported by out-of-sample evidence; otherwise use qualitative evidence score and explicitly say it is not a probability
- key reasons for and against the setup; conditions that cancel it
- risk/position-size estimate only if account equity, stop distance and contract rules are known
- signal expiry / when to recalculate
- fees/slippage assumptions and paper/live mode label
Never draw a trade plan from historical crossover signals as though it were a current entry. Historical arrows are backtest events; current plan must be calculated from the latest valid closed candles and be clearly differentiated.

## Research lessons and caveats
- Time-series momentum/trend-following has long-horizon empirical support across diversified futures markets (Moskowitz, Ooi & Pedersen 2012; Hurst, Ooi & Pedersen 2017), but transferring results to 1m-5m crypto requires new out-of-sample tests.
- Baltas & Kosowski (2013) report that a fitted linear-trend signal reduced turnover by roughly two thirds versus a simple sign-of-return signal in their 75-futures study; fewer unnecessary trades can reduce transaction costs, but this is not a universal crypto result.
- Bailey et al. (2016) explain why selecting the best historical strategy from many trials creates backtest-overfitting risk and propose CSCV/PBO methods.
- TradingView strategy simulation depends on broker-emulator assumptions; fees, slippage and realistic order timing must be configured.
- CFTC warns that virtual currency volatility and leverage amplify losses and no strategy can guarantee success.
- Technical indicators and chart patterns have mixed evidence; prefer hypothesis-driven testing to folklore. RSI, MACD, Fibonacci, candlesticks, and support/resistance must earn their place through incremental out-of-sample value after costs.

## Curated sources
1. Moskowitz, Ooi & Pedersen (2012), "Time series momentum", Journal of Financial Economics: https://doi.org/10.1016/j.jfineco.2011.11.003
2. Hurst, Ooi & Pedersen (2017), "A Century of Evidence on Trend-Following Investing": https://www.aqr.com/-/media/AQR/Documents/Insights/Journal-Article/AQR-JPM-Fall-2017.pdf
3. Baltas & Kosowski (2013), "Improving Time-Series Momentum Strategies": https://www.cmegroup.com/education/files/improving-time-series-momentum-strategies.pdf
4. Bailey et al. (2016), "The Probability of Backtest Overfitting": https://escholarship.org/uc/item/4w1110bb
5. Binance USDⓈ-M Futures Kline/Candlestick documentation: https://developers.binance.info/en/docs/catalog/derivatives-trading-usds-margined-futures/market-data/rest-api/Kline-Candlestick-Data
6. TradingView Pine Script strategy documentation: https://www.tradingview.com/pine-script-docs/concepts/strategies/
7. CFTC, "Understand the Risks of Virtual Currency Trading": https://www.cftc.gov/LearnAndProtect/AdvisoriesAndArticles/understand_risks_of_virtual_currency.html


## Additional model-selection discipline (Exa research review, 2026-10-12)
- Treat every inspected validation window as consumed. If a strategy is changed after examining its out-of-sample result, that window has become development data; reserve a new untouched holdout for the frozen candidate.
- Apply realistic transaction costs to both development and evaluation periods. A gross edge can disappear after fees and implementation shortfall.
- Prefer the simplest candidate unless a more complex model shows a meaningful, repeatable improvement across chronological folds and untouched data. Complexity and repeated tuning can increase the gap between simulated and live performance.
- Log every tested hypothesis, parameter set, dataset fingerprint, and rejection reason. Do not quietly discard losing experiments or promote the best result from a large search without accounting for multiple testing.
- Source reviewed: “A Backtesting Protocol in the Era of Machine Learning,” available at https://people.duke.edu/~charvey/Research/Published_Papers/P138_A_backtesting_protocol.pdf. The retrieved text emphasizes that repeatedly adapting a model after observing an out-of-sample failure converts that sample into training data, and that trading costs can erase apparent statistical significance. This is a research-process warning, not evidence that a particular strategy works. The source text was reviewed via search excerpts, not a full independent replication.
