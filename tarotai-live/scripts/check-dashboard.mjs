import { readFileSync } from "node:fs";
import { Script } from "node:vm";

const pages = ["console.html", "agents.html", "trading-desk.html", "trading.html", "virtual.html"];
const htmlByPage = new Map();

for (const page of pages) {
  const html = readFileSync(new URL("../public/" + page, import.meta.url), "utf8");
  htmlByPage.set(page, html);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/\bsrc\s*=/.test(match[1]))
    .map((match) => match[2])
    .filter((script) => script.trim().length > 0);
  if (!scripts.length) {
    throw new Error("Expected at least one inline script in " + page);
  }
  for (const [index, source] of scripts.entries()) {
    new Script(source, { filename: page + ":inline-script-" + (index + 1) });
  }
  if (page === "trading-desk.html") {
    for (const file of ["live-agent-monitor.js", "orderflow-panel.js"]) {
      const source = readFileSync(new URL("../public/" + file, import.meta.url), "utf8");
      new Script(source, { filename: file });
      console.log(file + " syntax check passed");
    }
  }
  if (page === "virtual.html") {
    if (!html.includes('id="bubbleChart"') || !html.includes('id="bubbleOverlay"') ||
        !html.includes('id="liquidityProfileCanvas"')) {
      throw new Error("Virtual order-flow chart is missing required chart layers.");
    }
    if (!html.includes("signal:AbortSignal.timeout(9000)")) {
      throw new Error("Virtual chart candle-history request must have a bounded timeout.");
    }
    if (!html.includes("cdn.jsdelivr.net/npm/lightweight-charts@4.2.3")) {
      throw new Error("Virtual chart must have a chart-library CDN fallback.");
    }
    const liveStart = html.indexOf("startKlineSocket(run);redraw();void renderVirtualForecast");
    const blockingForecast = html.indexOf("await renderVirtualForecast(run,{force:true,fit:true})");
    if (liveStart < 0 || blockingForecast >= 0) {
      throw new Error("Live candle streaming must start before asynchronous forecast work.");
    }
    if (!html.includes("Conditional bullish path") || !html.includes("Conditional bearish path")) {
      throw new Error("Virtual chart must expose both conditional trend scenarios.");
    }
    if (!html.includes("No exchange order was sent.")) {
      throw new Error("Virtual chart must clearly label paper-only order actions.");
    }
  }
  console.log(page + " inline JavaScript syntax check passed");
}
