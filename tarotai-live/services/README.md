# TarotAI Gemini Performance Optimizer

A small FastAPI service that accepts chart telemetry and timing measurements, applies deterministic threshold checks, and asks Gemini for structured, actionable optimization recommendations. It never edits code, changes settings, or executes trades.

## Configure

Copy `.env.example` to a private environment file and set `GEMINI_API_KEY` from Google AI Studio. Never commit a real key or expose it to browser code. `GEMINI_MODEL` defaults to `gemini-2.5-flash`.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r services/requirements.txt
export GEMINI_API_KEY="your-server-side-key"
export GEMINI_MODEL="gemini-2.5-flash"
uvicorn services.performance_optimizer:app --host 127.0.0.1 --port 8787
```

Run from the `tarotai-live` directory. Keep the service behind your existing private authentication gateway or an authenticated backend proxy before exposing it outside localhost.

## Request

POST `/analyze` with JSON:

```json
{
  "chart": {
    "chart_type": "candlestick",
    "symbol": "BTCUSDT",
    "timeframe": "5m",
    "renderer_status": "ok",
    "error_messages": [],
    "visible_candles": 300,
    "expected_update_interval_ms": 1000
  },
  "execution_speeds": {
    "frame_time_ms": 42,
    "fps": 24,
    "render_time_ms": 58,
    "data_to_render_ms": 850,
    "websocket_lag_ms": 240,
    "api_latency_ms": 180,
    "dropped_frames": 4,
    "chart_update_count": 3000
  },
  "recent_events": ["Chart briefly froze during symbol switch"]
}
```

The response includes detected issues, severity-ranked recommendations, and a verification step for each recommendation. Analysis is telemetry-based: it cannot independently see the user's screen or inspect source code. Only send measured, non-sensitive diagnostics; do not include API keys, account identifiers, or trading credentials.

## Integration note

This service runs as a separate Python process/container; the current Next.js app does not automatically host it. The Next.js backend or an authenticated internal gateway should forward frontend telemetry to this service. Do not call it directly from browser code because that would expose service credentials and could bypass app authentication.
