(() => {
  "use strict";
  const panel = document.getElementById("orderflowPanel");
  const symbolInput = document.getElementById("liveSymbol");
  if (!panel || !symbolInput || !window.WebSocket) return;

  const byId = (id) => document.getElementById(id);
  const els = {
    status: byId("orderflowStatus"), spread: byId("orderflowSpread"),
    imbalance: byId("orderflowImbalance"), takerSplit: byId("orderflowTakerSplit"),
    takerDelta: byId("orderflowTakerDelta"), asks: byId("orderflowAsks"),
    bids: byId("orderflowBids"), note: byId("orderflowNote")
  };
  const book = { bids: new Map(), asks: new Map(), lastUpdateId: null, synced: false, lastMessageAt: 0 };
  let depthSocket = null, tradeSocket = null, generation = 0, reconnectTimer = null, renderTimer = null;
  let snapshotRetryTimer = null, tradeReconnectTimer = null, snapshotInFlight = false, resyncAttempts = 0, reconnectAttempts = 0, quickRenderTimer = null;
  let bufferedDepth = [], lastTakerMessageAt = 0, trades = [], activeSymbol = "";

  const setStatus = (text, tone) => {
    if (!els.status) return;
    els.status.textContent = text;
    els.status.className = tone || "amber";
  };
  const fmtPrice = (n) => Number(n).toLocaleString("en-US", { maximumSignificantDigits: 8 });
  const fmtMoney = (n) => {
    if (!Number.isFinite(n)) return "—";
    return "$" + new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
  };
  const fmtQty = (n) => new Intl.NumberFormat("en-US", { maximumSignificantDigits: 4 }).format(n);
  function closeSockets() {
    for (const socket of [depthSocket, tradeSocket]) {
      if (socket) {
        try { socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null; socket.close(); } catch (_) {}
      }
    }
    depthSocket = tradeSocket = null;
  }
  function clearTimers() {
    for (const timer of [reconnectTimer, renderTimer, snapshotRetryTimer, tradeReconnectTimer, quickRenderTimer]) if (timer) clearTimeout(timer);
    reconnectTimer = renderTimer = snapshotRetryTimer = tradeReconnectTimer = quickRenderTimer = null;
  }
  function scheduleRender() {
    if (quickRenderTimer) return;
    quickRenderTimer = setTimeout(() => { quickRenderTimer = null; render(); }, 120);
  }
  function resetState() {
    book.bids.clear(); book.asks.clear(); book.lastUpdateId = null;
    book.synced = false; book.lastMessageAt = 0;
    snapshotInFlight = false; resyncAttempts = 0; bufferedDepth = [];
    trades = []; lastTakerMessageAt = 0;
    els.spread.textContent = els.imbalance.textContent = els.takerSplit.textContent = els.takerDelta.textContent = "—";
    els.asks.innerHTML = '<div class="empty">Waiting for synchronized depth…</div>';
    els.bids.innerHTML = '<div class="empty">Waiting for synchronized depth…</div>';
  }
  function trimMap(map, isBid) {
    if (map.size <= 1200) return;
    const sorted = Array.from(map.keys()).sort((a, b) => isBid ? b - a : a - b);
    for (const price of sorted.slice(1200)) map.delete(price);
  }
  function applySide(map, rows) {
    if (!Array.isArray(rows)) throw new Error("Malformed depth delta.");
    for (const row of rows) {
      const price = Number(row && row[0]), quantity = Number(row && row[1]);
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(quantity) || quantity < 0) throw new Error("Invalid depth delta.");
      if (quantity === 0) map.delete(price);
      else map.set(price, quantity);
    }
  }
  function applyDepthEvent(event, initial) {
    if (!initial && Number(event.pu) !== book.lastUpdateId) return false;
    applySide(book.bids, event.b || []);
    applySide(book.asks, event.a || []);
    book.lastUpdateId = Number(event.u);
    trimMap(book.bids, true); trimMap(book.asks, false);
    const bestBid = bestLevel(book.bids, true), bestAsk = bestLevel(book.asks, false);
    if (!bestBid || !bestAsk || bestBid[0] >= bestAsk[0]) return false;
    return true;
  }
  function bestLevel(map, isBid) {
    let best = null;
    for (const item of map) if (!best || (isBid ? item[0] > best[0] : item[0] < best[0])) best = item;
    return best;
  }
  async function loadSnapshot(runId) {
    if (snapshotInFlight || runId !== generation) return;
    snapshotInFlight = true;
    setStatus("SYNCING SNAPSHOT", "amber");
    try {
      const response = await fetch("/api/trading/orderbook?symbol=" + encodeURIComponent(activeSymbol), {
        method: "GET", cache: "no-store", credentials: "same-origin",
        headers: { "Accept": "application/json" }
      });
      const data = await response.json().catch(() => ({}));
      if (runId !== generation) return;
      if (!response.ok || !data.snapshot) {
        const message = response.status === 401 ? "Private session expired; unlock TarotAI to sync liquidity." :
          response.status === 503 ? "Private access is not configured." :
          String(data.error || "Order-book snapshot unavailable.");
        setStatus(response.status === 401 || response.status === 503 ? "AUTH REQUIRED" : "SNAPSHOT ERROR", "red");
        els.note.textContent = message + " Market analysis remains independent; no orders are sent.";
        snapshotRetryTimer = setTimeout(() => { snapshotInFlight = false; void loadSnapshot(runId); }, 7000);
        return;
      }
      if (Number.isFinite(Number(data.snapshotAgeMs)) && Number(data.snapshotAgeMs) > 15000) throw new Error("Snapshot arrived stale; refusing to seed the book.");
      book.bids.clear(); book.asks.clear();
      for (const [p, q] of data.snapshot.bids || []) {
        const price = Number(p), qty = Number(q);
        if (Number.isFinite(price) && price > 0 && Number.isFinite(qty) && qty > 0) book.bids.set(price, qty);
      }
      for (const [p, q] of data.snapshot.asks || []) {
        const price = Number(p), qty = Number(q);
        if (Number.isFinite(price) && price > 0 && Number.isFinite(qty) && qty > 0) book.asks.set(price, qty);
      }
      book.lastUpdateId = Number(data.snapshot.lastUpdateId);
      book.synced = false;
      snapshotInFlight = false;
      resyncAttempts = 0;
      if (!Number.isSafeInteger(book.lastUpdateId) || !bestLevel(book.bids, true) || !bestLevel(book.asks, false)) throw new Error("Malformed snapshot received.");
      trySynchronize(runId);
    } catch (error) {
      if (runId !== generation) return;
      snapshotInFlight = false;
      setStatus("SNAPSHOT ERROR", "red");
      els.note.textContent = (error && error.message ? error.message : "Could not synchronize the order book.") + " Retrying read-only market data.";
      snapshotRetryTimer = setTimeout(() => void loadSnapshot(runId), 5000);
    }
  }
  function requestResync(reason, runId) {
    if (runId !== generation || snapshotInFlight) return;
    book.synced = false;
    resyncAttempts += 1;
    bufferedDepth = [];
    setStatus("RE-SYNCHRONIZING", "amber");
    els.note.textContent = "Depth sequence gap detected (" + reason + "). Refreshing the snapshot; unsynchronized depth is not displayed as live.";
    if (resyncAttempts > 4) {
      setStatus("DEPTH FEED UNRELIABLE", "red");
      els.note.textContent = "Repeated depth sequence gaps. Disconnecting and retrying with a clean feed.";
      if (depthSocket) { try { depthSocket.close(); } catch (_) {} }
      return;
    }
    snapshotRetryTimer = setTimeout(() => void loadSnapshot(runId), 350);
  }
  function trySynchronize(runId) {
    if (runId !== generation || book.lastUpdateId == null || book.synced || snapshotInFlight) return;
    const index = bufferedDepth.findIndex((event) => Number(event.u) >= book.lastUpdateId);
    if (index < 0) return;
    const first = bufferedDepth[index];
    if (!(Number(first.U) <= book.lastUpdateId && Number(first.u) >= book.lastUpdateId)) {
      if (Number(first.U) > book.lastUpdateId) requestResync("snapshot ID was skipped", runId);
      return;
    }
    if (!applyDepthEvent(first, true)) { requestResync("invalid first update", runId); return; }
    book.synced = true;
    const remaining = bufferedDepth.slice(index + 1);
    bufferedDepth = [];
    for (const event of remaining) {
      if (Number(event.u) <= book.lastUpdateId) continue;
      if (!applyDepthEvent(event, false)) {
        requestResync("previous-update ID did not match", runId);
        return;
      }
    }
    reconnectAttempts = 0;
    setStatus("LIVE · SEQUENCE SYNCED", "green");
    els.note.textContent = "Depth feed is sequence-synchronized to Binance USDⓈ-M Futures. Resting orders can cancel or move; depth imbalance and taker delta are descriptive, not stand-alone trade signals.";
    scheduleRender();
  }
  function handleDepthMessage(event, runId) {
    if (runId !== generation) return;
    book.lastMessageAt = Date.now();
    if (book.synced) {
      if (Number(event.u) <= book.lastUpdateId) return;
      if (!applyDepthEvent(event, false)) { requestResync("depth continuity check failed", runId); return; }
      scheduleRender();
      return;
    }
    bufferedDepth.push(event);
    if (bufferedDepth.length > 4000) {
      bufferedDepth = [];
      requestResync("snapshot buffer overflow", runId);
      return;
    }
    trySynchronize(runId);
  }
  function startTradeSocket(symbol, runId, attempt = 0) {
    try {
      tradeSocket = new WebSocket("wss://fstream.binance.com/market/stream?streams=" + symbol.toLowerCase() + "@aggTrade");
      tradeSocket.onmessage = (message) => {
        if (runId !== generation) return;
        let packet; try { packet = JSON.parse(message.data); } catch (_) { return; }
        const e = packet && packet.data && typeof packet.data === "object" ? packet.data : packet;
        const price = Number(e.p), qty = Number(e.q);
        if (e.e !== "aggTrade" || !Number.isFinite(price) || price <= 0 || !Number.isFinite(qty) || qty <= 0) return;
        const ts = Number(e.T) || Date.now();
        // m=true means the buyer was maker, so the active taker was selling.
        trades.push({ time: ts, price, qty, quote: price * qty * (e.m === true ? -1 : 1) });
        if (trades.length > 12000) trades = trades.slice(-8000);
        lastTakerMessageAt = Date.now();
        scheduleRender();
      };
      tradeSocket.onerror = () => {
        if (runId === generation && tradeSocket) { try { tradeSocket.close(); } catch (_) {} }
      };
      tradeSocket.onclose = () => {
        if (runId !== generation) return;
        els.takerSplit.textContent = "FEED RECONNECTING";
        const delay = Math.min(15000, 750 * Math.pow(2, Math.min(4, attempt)));
        tradeReconnectTimer = setTimeout(() => {
          if (runId === generation) startTradeSocket(symbol, runId, Math.min(attempt + 1, 5));
        }, delay);
      };
    } catch (_) {
      els.takerSplit.textContent = "WS UNAVAILABLE";
    }
  }
  function start(symbol, attempt = 0) {
    generation += 1;
    const runId = generation;
    clearTimers(); closeSockets(); resetState();
    activeSymbol = String(symbol || "BTCUSDT").toUpperCase();
    setStatus("CONNECTING", "amber");
    els.note.textContent = "Connecting to the public Binance USDⓈ-M Futures depth and aggregate-trade streams. Read-only analytics; no order placement.";
    try {
      depthSocket = new WebSocket("wss://fstream.binance.com/public/stream?streams=" + activeSymbol.toLowerCase() + "@depth@100ms");
      depthSocket.onopen = () => { if (runId === generation) void loadSnapshot(runId); };
      depthSocket.onmessage = (message) => {
        if (runId !== generation) return;
        let packet; try { packet = JSON.parse(message.data); } catch (_) { return; }
        const e = packet && packet.data && typeof packet.data === "object" ? packet.data : packet;
        if (e.e === "depthUpdate" && Number.isFinite(Number(e.U)) && Number.isFinite(Number(e.u))) handleDepthMessage(e, runId);
      };
      depthSocket.onerror = () => {
        if (runId === generation) setStatus("DEPTH CONNECTION ERROR", "red");
      };
      depthSocket.onclose = () => {
        if (runId !== generation) return;
        book.synced = false;
        setStatus("RECONNECTING", "amber");
        reconnectAttempts = Math.min(6, Math.max(attempt + 1, reconnectAttempts + 1));
        reconnectTimer = setTimeout(() => start(activeSymbol, reconnectAttempts), Math.min(15000, 750 * Math.pow(2, reconnectAttempts)));
      };
    } catch (_) {
      setStatus("WEBSOCKET UNAVAILABLE", "red");
      reconnectTimer = setTimeout(() => start(activeSymbol, attempt + 1), Math.min(15000, 1000 * Math.pow(2, Math.min(4, attempt))));
    }
    startTradeSocket(activeSymbol, runId);
    renderTimer = setTimeout(function pulse() {
      if (runId !== generation) return;
      const now = Date.now();
      trades = trades.filter((item) => now - item.time <= 60_000 && now >= item.time - 5000);
      if (!book.synced) {
        if (book.lastMessageAt && now - book.lastMessageAt > 15000) setStatus("DEPTH STALE", "red");
      } else if (!book.lastMessageAt || now - book.lastMessageAt > 15000) {
        setStatus("DEPTH STALE", "red");
      } else {
        setStatus("LIVE · SEQUENCE SYNCED", "green");
      }
      render();
      renderTimer = setTimeout(pulse, 1000);
    }, 1000);
  }
  function createLevelRow(side, price, qty, notional, maxNotional) {
    const row = document.createElement("div");
    row.style.cssText = "display:grid;grid-template-columns:minmax(0,1fr) 82px;gap:8px;align-items:center;position:relative;padding:5px 7px;margin:3px 0;border-radius:7px;overflow:hidden;background:#0b1119;border:1px solid #202b39;font:11px/1.4 ui-monospace,monospace;";
    const bar = document.createElement("span");
    const width = Math.max(2, Math.min(100, maxNotional > 0 ? notional / maxNotional * 100 : 0));
    bar.style.cssText = "position:absolute;top:0;bottom:0;" + (side === "bid" ? "left:0;" : "right:0;") + "width:" + width + "%;opacity:.17;background:" + (side === "bid" ? "#65e6ad" : "#ff7b83") + ";pointer-events:none;";
    const left = document.createElement("span");
    left.style.cssText = "position:relative;z-index:1;display:flex;justify-content:space-between;gap:8px;min-width:0;";
    const p = document.createElement("span");
    p.style.color = side === "bid" ? "#65e6ad" : "#ff7b83";
    p.textContent = fmtPrice(price);
    const q = document.createElement("span");
    q.style.color = "#9caabc";
    q.textContent = fmtQty(qty) + " qty";
    left.append(p, q);
    const money = document.createElement("span");
    money.style.cssText = "position:relative;z-index:1;text-align:right;color:#edf3fa;";
    money.textContent = fmtMoney(notional);
    row.append(bar, left, money);
    return row;
  }
  function renderSide(container, levels, side) {
    container.replaceChildren();
    if (!levels.length) {
      const empty = document.createElement("div");
      empty.className = "empty"; empty.textContent = "No synchronized levels available.";
      container.append(empty); return;
    }
    const maxNotional = Math.max(...levels.map(([price, qty]) => price * qty), 1);
    for (const [price, qty] of levels) container.append(createLevelRow(side, price, qty, price * qty, maxNotional));
  }
  function render() {
    const now = Date.now();
    const liveTrades = trades.filter((trade) => now - trade.time <= 60_000 && now >= trade.time - 5000);
    let buy = 0, sell = 0;
    for (const trade of liveTrades) {
      if (trade.quote > 0) buy += trade.quote; else sell += -trade.quote;
    }
    if (lastTakerMessageAt && now - lastTakerMessageAt <= 15000) {
      els.takerSplit.textContent = fmtMoney(buy) + " / " + fmtMoney(sell);
      const total = buy + sell;
      els.takerDelta.textContent = (buy >= sell ? "+" : "−") + fmtMoney(Math.abs(buy - sell));
      els.takerDelta.style.color = buy >= sell ? "#65e6ad" : "#ff7b83";
      els.takerSplit.title = total > 0 ? "Aggressive buy share: " + (buy / total * 100).toFixed(1) + "%; last 60 seconds." : "No trades in the rolling window.";
    } else {
      els.takerSplit.textContent = "STALE / WAIT";
      els.takerDelta.textContent = "—";
      els.takerDelta.style.color = "";
    }
    if (!book.synced) return;
    const bids = Array.from(book.bids, ([price, qty]) => [price, qty]).sort((a,b) => b[0]-a[0]);
    const asks = Array.from(book.asks, ([price, qty]) => [price, qty]).sort((a,b) => a[0]-b[0]);
    if (!bids.length || !asks.length || bids[0][0] >= asks[0][0]) {
      setStatus("INVALID BOOK · RESYNC", "red");
      requestResync("best prices crossed", generation);
      return;
    }
    const bestBid = bids[0][0], bestAsk = asks[0][0], mid = (bestBid + bestAsk) / 2;
    const spreadBps = (bestAsk - bestBid) / mid * 10000;
    els.spread.textContent = fmtPrice(bestBid) + " / " + fmtPrice(bestAsk) + " · " + spreadBps.toFixed(2) + " bps";
    const bidDepth = bids.filter(([p]) => p >= mid * 0.995 && p <= mid).reduce((sum, [p,q]) => sum + p*q, 0);
    const askDepth = asks.filter(([p]) => p <= mid * 1.005 && p >= mid).reduce((sum, [p,q]) => sum + p*q, 0);
    const total = bidDepth + askDepth;
    const imbalance = total > 0 ? (bidDepth - askDepth) / total * 100 : NaN;
    els.imbalance.textContent = Number.isFinite(imbalance) ? (imbalance >= 0 ? "+" : "") + imbalance.toFixed(1) + "% " + (imbalance > 8 ? "BID-HEAVY" : imbalance < -8 ? "ASK-HEAVY" : "BALANCED") : "—";
    els.imbalance.style.color = imbalance > 8 ? "#65e6ad" : imbalance < -8 ? "#ff7b83" : "";
    renderSide(els.asks, asks.slice(0, 5), "ask");
    renderSide(els.bids, bids.slice(0, 5), "bid");
  }

  if (!document.getElementById("orderflowPanelStyle")) {
    const style = document.createElement("style");
    style.id = "orderflowPanelStyle";
    style.textContent = ".orderflow-panel .live-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.orderflow-levels{min-height:90px}.orderflow-panel .live-metric strong{font-size:14px;overflow-wrap:anywhere}@media(max-width:600px){.orderflow-panel .live-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}";
    document.head.append(style);
  }
  symbolInput.addEventListener("change", () => start(symbolInput.value));
  window.addEventListener("beforeunload", () => { generation++; clearTimers(); closeSockets(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && activeSymbol && (!book.synced || Date.now() - book.lastMessageAt > 15000)) start(symbolInput.value);
  });
  start(symbolInput.value || "BTCUSDT");
})();
