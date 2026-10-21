(() => {
  "use strict";

  if (window.__tarotaiAiIntelligenceLoaded) return;
  window.__tarotaiAiIntelligenceLoaded = true;

  const telemetry = {
    longTaskCount: 0,
    longTaskMaxMs: 0,
    chartMutationCount: 0,
    scriptErrorCount: 0,
    promiseRejectionCount: 0,
    browserErrors: [],
  };

  function scrub(value) {
    return String(value || "Unknown browser error")
      .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED_KEY]")
      .replace(/xai-[0-9A-Za-z_-]{12,}/gi, "[REDACTED_KEY]")
      .replace(/sk-or-v1-[0-9A-Za-z_-]+/g, "[REDACTED_KEY]")
      .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
      .replace(/([?&](?:key|token|signature)=)[^&\s]+/gi, "$1[REDACTED]")
      .slice(0, 220);
  }

  function rememberError(message) {
    telemetry.browserErrors.push(scrub(message));
    telemetry.browserErrors = telemetry.browserErrors.slice(-8);
  }

  window.addEventListener("error", (event) => {
    telemetry.scriptErrorCount += 1;
    rememberError(event && event.message ? event.message : "Browser script/resource error");
  });

  window.addEventListener("unhandledrejection", (event) => {
    telemetry.promiseRejectionCount += 1;
    const reason = event && event.reason;
    rememberError(reason && reason.message ? reason.message : String(reason || "Unhandled promise rejection"));
  });

  try {
    if ("PerformanceObserver" in window) {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.entryType === "longtask") {
            telemetry.longTaskCount += 1;
            telemetry.longTaskMaxMs = Math.max(telemetry.longTaskMaxMs, entry.duration || 0);
          }
        });
      });
      observer.observe({ type: "longtask", buffered: true });
    }
  } catch (_) {
    // Some browsers do not expose Long Tasks; that metric remains informational.
  }

  function initialize() {
    const chart = document.getElementById("live-agent-chart");
    const anchor = chart || document.querySelector(".app") || document.body;
    if (!anchor || document.getElementById("tarotaiAiIntelligence")) return;

    const style = document.createElement("style");
    style.textContent = [
      ".tai-ai-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-top:14px}",
      ".tai-ai-card{min-width:0;border:1px solid #26384a;border-radius:13px;background:linear-gradient(160deg,#0d1721,#080d14);padding:15px}",
      ".tai-ai-card h3{font-size:14px;margin:0 0 6px;color:#edf4fb}",
      ".tai-ai-card p{font-size:12px;line-height:1.55;color:#94a5b8;margin:0 0 12px}",
      ".tai-ai-status{font-size:11px;line-height:1.5;color:#8fa2b7;min-height:18px;margin:9px 0}",
      ".tai-ai-status[data-kind=error]{color:#ff8989}.tai-ai-status[data-kind=success]{color:#79e7b5}",
      ".tai-ai-summary{font-size:12px;line-height:1.6;color:#d8e3ef;white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0}",
      ".tai-ai-details{margin-top:10px;font-size:11px;color:#9aadc0}",
      ".tai-ai-details summary{cursor:pointer}",
      ".tai-ai-details pre{max-height:320px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.55 ui-monospace,SFMono-Regular,monospace;color:#c9d8e7;background:#080d13;border:1px solid #233243;border-radius:9px;padding:10px}",
      ".tai-ai-note{font-size:11px;color:#91a1b4;line-height:1.6;margin:12px 1px 0}",
      "@media(max-width:700px){.tai-ai-grid{grid-template-columns:1fr}.tai-ai-card{padding:12px}}",
    ].join("\n");
    document.head.appendChild(style);

    const panel = document.createElement("section");
    panel.id = "tarotaiAiIntelligence";
    panel.className = "panel full";
    panel.innerHTML = [
      '<div class="live-trade-head">',
      ' <div><h2 class="live-trade-title">Grok Future Trend &amp; Gemini Chart Health</h2>',
      ' <div class="sub">Fresh Binance Futures candles for Grok · measured browser telemetry for Gemini · no automatic trades or code changes</div></div>',
      ' <span class="live-feed-pill">MANUAL AI CHECKS</span>',
      '</div>',
      '<div class="tai-ai-grid">',
      ' <article class="tai-ai-card">',
      '  <h3>Future Trend Engine</h3>',
      '  <p>Ask Grok to analyze recent closed candles alongside TarotAI’s independent heuristic baseline.</p>',
      '  <button class="btn primary" id="taiAiRunForecast" type="button">Analyze with Grok</button>',
      '  <div class="tai-ai-status" id="taiAiForecastStatus" role="status" aria-live="polite">Ready when you are.</div>',
      '  <div class="tai-ai-summary" id="taiAiForecastSummary">No forecast requested yet.</div>',
      '  <details class="tai-ai-details"><summary>View structured forecast and baseline</summary><pre id="taiAiForecastJson"></pre></details>',
      ' </article>',
      ' <article class="tai-ai-card">',
      '  <h3>Chart Health Diagnostics</h3>',
      '  <p>Gemini reviews observed quote age, page timing, long tasks, chart mutations, and browser-reported errors.</p>',
      '  <button class="btn" id="taiAiRunDiagnostics" type="button">Check with Gemini</button>',
      '  <div class="tai-ai-status" id="taiAiDiagnosticsStatus" role="status" aria-live="polite">Collecting telemetry in this tab.</div>',
      '  <div class="tai-ai-summary" id="taiAiDiagnosticsSummary">No diagnostic run yet.</div>',
      '  <details class="tai-ai-details"><summary>View structured diagnostics</summary><pre id="taiAiDiagnosticsJson"></pre></details>',
      ' </article>',
      '</div>',
      '<p class="tai-ai-note">AI predictions are uncertain and are not validated trading signals. Diagnostic findings are hypotheses based on telemetry, not proof of a source-code defect. This panel never places orders or edits files.</p>',
    ].join("");

    if (chart) chart.insertAdjacentElement("afterend", panel);
    else anchor.appendChild(panel);

    const forecastButton = document.getElementById("taiAiRunForecast");
    const diagnosticsButton = document.getElementById("taiAiRunDiagnostics");
    const forecastStatus = document.getElementById("taiAiForecastStatus");
    const diagnosticsStatus = document.getElementById("taiAiDiagnosticsStatus");
    const forecastSummary = document.getElementById("taiAiForecastSummary");
    const diagnosticsSummary = document.getElementById("taiAiDiagnosticsSummary");
    const forecastJson = document.getElementById("taiAiForecastJson");
    const diagnosticsJson = document.getElementById("taiAiDiagnosticsJson");

    if (chart && "MutationObserver" in window) {
      try {
        const observer = new MutationObserver((mutations) => {
          telemetry.chartMutationCount += mutations.length;
        });
        observer.observe(chart, { childList: true, subtree: true, attributes: true });
      } catch (_) {
        // Chart DOM observation is optional.
      }
    }

    function pageTiming() {
      const entry = performance.getEntriesByType("navigation")[0];
      if (!entry) return { navigationLoadMs: null, domReadyMs: null };
      return {
        navigationLoadMs: entry.loadEventEnd > 0 ? Math.round(entry.loadEventEnd) : null,
        domReadyMs: entry.domContentLoadedEventEnd > 0 ? Math.round(entry.domContentLoadedEventEnd) : null,
      };
    }

    function collectMetrics() {
      const rectangle = chart ? chart.getBoundingClientRect() : { width: 0, height: 0 };
      const lastTradeAt = Number(window.tarotaiSharedLastTradeAt || 0);
      const quoteAgeMs = lastTradeAt > 0 ? Math.max(0, Date.now() - lastTradeAt) : null;
      const timing = pageTiming();
      const metrics = {
        longTaskCount: telemetry.longTaskCount,
        longTaskMaxMs: Math.round(telemetry.longTaskMaxMs),
        chartMutationCount: telemetry.chartMutationCount,
        scriptErrorCount: telemetry.scriptErrorCount,
        promiseRejectionCount: telemetry.promiseRejectionCount,
        chartContainerWidth: Math.max(0, Math.round(rectangle.width)),
        chartContainerHeight: Math.max(0, Math.round(rectangle.height)),
        chartLibrary: window.LightweightCharts ? "lightweight-charts" : "chart-library-not-detected",
        consoleErrors: telemetry.browserErrors.slice(-6),
      };
      if (timing.navigationLoadMs !== null) metrics.navigationLoadMs = timing.navigationLoadMs;
      if (timing.domReadyMs !== null) metrics.domReadyMs = timing.domReadyMs;
      if (quoteAgeMs !== null) metrics.quoteAgeMs = quoteAgeMs;
      return metrics;
    }

    async function run(kind) {
      const isForecast = kind === "forecast";
      const status = isForecast ? forecastStatus : diagnosticsStatus;
      const summary = isForecast ? forecastSummary : diagnosticsSummary;
      const jsonOutput = isForecast ? forecastJson : diagnosticsJson;
      const symbolSelect = document.getElementById("liveSymbol");
      const intervalSelect = document.getElementById("liveInterval");
      const symbol = symbolSelect && symbolSelect.value ? symbolSelect.value : "BTCUSDT";
      const interval = intervalSelect && intervalSelect.value ? intervalSelect.value : "5m";

      forecastButton.disabled = true;
      diagnosticsButton.disabled = true;
      status.dataset.kind = "";
      status.textContent = isForecast ? "Fetching closed candles and asking Grok…" : "Sending measured browser telemetry to Gemini…";
      summary.textContent = "";
      jsonOutput.textContent = "";

      const endpoint = isForecast ? "/api/trading/ai-forecast" : "/api/trading/diagnostics";
      const payload = isForecast
        ? { symbol: symbol, interval: interval, horizon: 3 }
        : { symbol: symbol, interval: interval, metrics: collectMetrics() };

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result || result.ok !== true) {
          throw new Error(result && result.error ? result.error : "Request failed (" + response.status + ").");
        }

        const details = isForecast ? result.forecast : result.diagnostics;
        if (isForecast) {
          const probabilities = details && details.probabilities;
          summary.textContent = [
            "Bias: " + ((details && details.bias) || "NO_EDGE"),
            "Confidence: " + (details && details.confidencePct !== null ? details.confidencePct + "%" : "not supplied"),
            "Summary: " + ((details && details.summary) || "No summary."),
            "Probabilities: " + (probabilities ? "bullish " + probabilities.bullish + "% · bearish " + probabilities.bearish + "% · range " + probabilities.rangeBound + "%" : "not supplied / not accepted"),
            "Data timestamp: " + (result.dataAsOf || "unknown"),
            "Heuristic baseline agrees: " + String(Boolean(result.directionAgreement)),
          ].join("\n");
        } else {
          const issues = details && Array.isArray(details.issues) ? details.issues : [];
          summary.textContent = [
            "Severity: " + ((details && details.severity) || "INFO"),
            "Summary: " + ((details && details.summary) || "No summary."),
            "Prioritized findings: " + issues.length,
            issues.slice(0, 3).map((issue, index) =>
              (index + 1) + ". " + (issue.title || "Finding") + " [" + (issue.severity || "LOW") + "]"
            ).join("\n"),
          ].filter(Boolean).join("\n");
        }

        jsonOutput.textContent = JSON.stringify(result, null, 2);
        status.dataset.kind = "success";
        status.textContent = "Completed · " + result.provider + " / " + result.model + " · " + result.providerLatencyMs + " ms provider time";
      } catch (error) {
        status.dataset.kind = "error";
        status.textContent = error && error.message ? error.message : "AI request failed.";
        summary.textContent = "No new result was accepted.";
      } finally {
        forecastButton.disabled = false;
        diagnosticsButton.disabled = false;
      }
    }

    forecastButton.addEventListener("click", () => run("forecast"));
    diagnosticsButton.addEventListener("click", () => run("diagnostics"));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();