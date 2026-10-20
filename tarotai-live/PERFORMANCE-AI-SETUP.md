# Gemini + Grok performance analysis

TarotAI's private virtual chart now sends periodic chart telemetry to `POST /api/performance/analyze`. The route checks the existing signed owner session, validates the telemetry shape and size, calls whichever providers have server-side keys, and returns provider analysis. It does not edit code or settings. The chart continues working if the analysis endpoint is unavailable.

## Vercel environment variables

Configure these in the TarotAI Vercel project's **server-side** environment settings, then redeploy the feature branch:

- `GEMINI_API_KEY` — Google AI Studio API key (required for Gemini)
- `GEMINI_MODEL` — optional; defaults to `gemini-2.5-flash`
- `XAI_API_KEY` — xAI API key (required for direct Grok access)
- `GROK_MODEL` — optional; defaults to `grok-3-mini`

Do not put provider keys in HTML, client JavaScript, Git, or a public environment variable. Never paste secrets into chat. At least one provider key must be configured for analysis; both are called in parallel when both keys are present, and a single provider can still return a result if the other fails.

## Telemetry collected

The virtual chart reports renderer status, selected symbol/timeframe, frame timing/FPS estimates, recent fetch latency, dropped-frame estimates, chart update counts, and a bounded set of recent browser errors. It does not send account credentials, API keys, or order details. Timing values are estimates from browser instrumentation, not proof of exchange latency or trading accuracy.

## Verification

After deployment, open the private virtual chart while signed in. The small **Performance AI** status at the lower-right should show the provider(s) responding after the first report interval. A missing key or provider failure is shown as a status/error; the chart itself should continue operating. Check the authenticated endpoint using a valid owner session and a telemetry JSON body matching the chart script. Build/deployment success has not yet been verified.
