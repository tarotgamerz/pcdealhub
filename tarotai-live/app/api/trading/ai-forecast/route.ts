import { buildForecast } from "@/lib/forecast.mjs";
import {
  isRecord,
  ownerGuard,
  parseModelJson,
  privateJson,
  readJsonLimited,
  RequestInputError,
} from "@/lib/ai-provider-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 25;

const INTERVALS = new Set(["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "1d"]);

function stringValue(value: unknown, limit = 420): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function finiteNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

function stringList(value: unknown, limit = 6): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().slice(0, 240))
    .filter(Boolean)
    .slice(0, limit);
}

function priceLevels(value: unknown, lastPrice: number): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is number =>
    typeof entry === "number" &&
    Number.isFinite(entry) &&
    entry > lastPrice * 0.5 &&
    entry < lastPrice * 1.5
  ).slice(0, 4);
}

function normalizeForecast(raw: Record<string, unknown>, lastPrice: number, horizon: number) {
  const allowedBias = new Set(["BULLISH", "BEARISH", "RANGE_BOUND", "NO_EDGE"]);
  const candidate = stringValue(raw.bias, 30).toUpperCase();
  const bias = allowedBias.has(candidate) ? candidate : "NO_EDGE";

  const bull = finiteNumber(raw.bullishProbability, 0, 100);
  const bear = finiteNumber(raw.bearishProbability, 0, 100);
  const range = finiteNumber(raw.rangeProbability, 0, 100);
  const total = bull !== null && bear !== null && range !== null ? bull + bear + range : 0;
  const probabilities =
    bull !== null && bear !== null && range !== null && Math.abs(total - 100) <= 12
      ? { bullish: Math.round(bull), bearish: Math.round(bear), rangeBound: Math.round(range) }
      : null;

  return {
    bias,
    confidencePct: finiteNumber(raw.confidencePct, 0, 100),
    probabilities,
    horizon: stringValue(raw.horizon, 100) || String(horizon) + " candles",
    summary: stringValue(raw.summary, 900) || "The model did not provide a usable summary.",
    keyDrivers: stringList(raw.keyDrivers),
    supportLevels: priceLevels(raw.supportLevels, lastPrice),
    resistanceLevels: priceLevels(raw.resistanceLevels, lastPrice),
    invalidation: stringValue(raw.invalidation, 500) || "No valid invalidation level was supplied.",
    riskFlags: stringList(raw.riskFlags),
    dataQuality: stringValue(raw.dataQuality, 300) || "Review market-data quality before relying on the analysis.",
  };
}

export async function POST(request: Request) {
  const authError = ownerGuard(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await readJsonLimited(request, 4096);
  } catch (error) {
    if (error instanceof RequestInputError) return privateJson({ error: error.message }, error.status);
    return privateJson({ error: "Could not read request." }, 400);
  }

  if (!isRecord(body)) return privateJson({ error: "Invalid request body." }, 400);

  const symbol = typeof body.symbol === "string" ? body.symbol.toUpperCase() : "BTCUSDT";
  const interval = typeof body.interval === "string" ? body.interval : "5m";
  const rawHorizon = Number(body.horizon === undefined ? 3 : body.horizon);
  const horizon = Number.isInteger(rawHorizon) ? Math.max(1, Math.min(12, rawHorizon)) : 3;

  if (!/^[A-Z0-9]{4,20}USDT$/.test(symbol) || !INTERVALS.has(interval)) {
    return privateJson({ error: "Unsupported USDT perpetual symbol or timeframe." }, 400);
  }

  const apiKey = (process.env.GROK_API_KEY || process.env.XAI_API_KEY || "").trim();
  if (!apiKey) {
    return privateJson({ error: "Grok is not configured. Set GROK_API_KEY or XAI_API_KEY in Vercel." }, 503);
  }

  try {
    const marketUrl = new URL("https://fapi.binance.com/fapi/v1/klines");
    marketUrl.searchParams.set("symbol", symbol);
    marketUrl.searchParams.set("interval", interval);
    marketUrl.searchParams.set("limit", "100");

    const marketResponse = await fetch(marketUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });

    if (!marketResponse.ok) {
      console.error("AI forecast market-data HTTP status:", marketResponse.status);
      return privateJson({ error: "Fresh Binance Futures candles are unavailable." }, 502);
    }

    const rawCandles: unknown = await marketResponse.json().catch(() => null);
    if (!Array.isArray(rawCandles)) {
      return privateJson({ error: "Binance returned an unexpected candle format." }, 502);
    }

    const now = Date.now();
    const candles = rawCandles
      .filter((row: unknown): row is unknown[] => Array.isArray(row) && row.length >= 7)
      .map((row: unknown[]) => ({
        openTime: Number(row[0]),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
        closeTime: Number(row[6]),
      }))
      .filter((candle: { openTime: number; open: number; high: number; low: number; close: number; volume: number; closeTime: number }) =>
        [candle.openTime, candle.open, candle.high, candle.low, candle.close, candle.volume, candle.closeTime].every(Number.isFinite) &&
        candle.open > 0 &&
        candle.high >= Math.max(candle.open, candle.close, candle.low) &&
        candle.low <= Math.min(candle.open, candle.close, candle.high) &&
        candle.volume >= 0 &&
        candle.closeTime < now - 100
      );

    if (candles.length < 30) return privateJson({ error: "Not enough valid closed candles for a forecast." }, 502);

    const baseline = buildForecast(candles, horizon);
    const latest = candles[candles.length - 1];
    const model = (process.env.GROK_MODEL || "grok-4.7").trim();

    const snapshot = {
      symbol,
      interval,
      horizonCandles: horizon,
      dataAsOf: new Date(latest.closeTime).toISOString(),
      latestClosedPrice: latest.close,
      candles: candles.slice(-50),
      independentHeuristicBaseline: {
        direction: baseline.direction,
        projectedPrice: baseline.projectedPrice,
        projectedChangePct: baseline.projectedChangePct,
        confidenceScore: baseline.confidenceScore,
        indicators: baseline.indicators,
        invalidation: baseline.invalidation,
      },
    };

    const prompt = [
      "Analyze this validated Binance USDⓈ-M Futures OHLCV snapshot for TarotAI.",
      "Use only the supplied data. Do not claim access to live order-book, funding, liquidation, news, or source-code data.",
      "The heuristic baseline is a simple calculation, not ground truth. Disagree when evidence supports disagreement.",
      "Return only JSON with keys bias (BULLISH, BEARISH, RANGE_BOUND, NO_EDGE), confidencePct (0-100 or null), bullishProbability, bearishProbability, rangeProbability (each 0-100 or all null), horizon, summary, keyDrivers (string array), supportLevels (number array), resistanceLevels (number array), invalidation, riskFlags (string array), dataQuality.",
      "If probabilities are given, they must sum to approximately 100 and must not be presented as calibrated unless supported by evidence. If evidence is weak or conflicting use NO_EDGE. Never fabricate backtest results, precise certainty or prices outside the observed range. Analysis only, not an instruction to trade.",
      JSON.stringify(snapshot),
    ].join("\n\n");

    const providerStartedAt = Date.now();
    const providerResponse = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 1100,
        messages: [
          { role: "system", content: "You are a cautious quantitative market analyst. Output strictly valid JSON." },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!providerResponse.ok) {
      console.error("Grok forecast provider HTTP status:", providerResponse.status);
      if (providerResponse.status === 429) return privateJson({ error: "Grok rate limit reached. Try again later." }, 429);
      if (providerResponse.status === 401 || providerResponse.status === 403) {
        return privateJson({ error: "Grok rejected the configured API key or its permissions." }, 502);
      }
      return privateJson({ error: "Grok could not complete the forecast." }, 502);
    }

    const providerData: unknown = await providerResponse.json().catch(() => null);
    if (!isRecord(providerData) || !Array.isArray(providerData.choices)) {
      return privateJson({ error: "Grok returned an unexpected response format." }, 502);
    }

    const choice = providerData.choices[0];
    if (!isRecord(choice) || !isRecord(choice.message) || typeof choice.message.content !== "string") {
      return privateJson({ error: "Grok returned no usable forecast." }, 502);
    }

    let rawForecast: Record<string, unknown>;
    try {
      rawForecast = parseModelJson(choice.message.content);
    } catch {
      return privateJson({ error: "Grok's response was not valid JSON. No forecast was accepted." }, 502);
    }

    const forecast = normalizeForecast(rawForecast, latest.close, horizon);

    return privateJson({
      ok: true,
      provider: "grok",
      model,
      providerLatencyMs: Date.now() - providerStartedAt,
      symbol,
      interval,
      source: "Binance USDⓈ-M Futures public closed candles",
      dataAsOf: new Date(latest.closeTime).toISOString(),
      latestClosedPrice: latest.close,
      forecast,
      independentHeuristicBaseline: {
        direction: baseline.direction,
        projectedPrice: baseline.projectedPrice,
        projectedChangePct: baseline.projectedChangePct,
        confidenceScore: baseline.confidenceScore,
        confidenceMeaning: baseline.confidenceMeaning,
        indicators: baseline.indicators,
        invalidation: baseline.invalidation,
      },
      directionAgreement:
        (baseline.direction === "up" && forecast.bias === "BULLISH") ||
        (baseline.direction === "down" && forecast.bias === "BEARISH") ||
        (baseline.direction === "sideways" && forecast.bias === "RANGE_BOUND"),
      readOnly: true,
      executionEnabled: false,
      note: "AI analysis of closed candles; not a validated trading signal or guaranteed prediction.",
    });
  } catch (error) {
    if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) {
      return privateJson({ error: "The market-data or Grok request timed out." }, 504);
    }
    console.error("Grok forecast handler failed:", error instanceof Error ? error.name : "unknown error");
    return privateJson({ error: "The Grok forecast could not be completed." }, 502);
  }
}
