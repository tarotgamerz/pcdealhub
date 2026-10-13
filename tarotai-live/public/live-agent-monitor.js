(() => {
  "use strict";
  const endpoint = "/api/trading/agents";
  const roleInfo = {
    trend: { name: "Trend & Regime", focus: "Trend persistence, EMA slope, and trend-versus-range conditions." },
    structure: { name: "Market Structure", focus: "Closed-candle breakouts, breakdowns, sweeps, and failed breaks." },
    momentum: { name: "Momentum & RSI", focus: "Momentum confirmation, RSI, exhaustion, and follow-through." },
    volatility: { name: "Volatility & ATR", focus: "Volatility regime, ATR expansion, and stop feasibility." },
    volume: { name: "Volume & Participation", focus: "Relative volume, candle-close location, and participation quality." },
    timeframe: { name: "Higher-Timeframe Analyst", focus: "Higher-timeframe direction versus the entry timeframe." },
    risk: { name: "Risk & Red-Team Veto", focus: "Failure scenarios, stop/target geometry, and risk/reward." }
  };
  const originalFetch = window.fetch.bind(window);
  const state = { phase: "idle", roles: [], agents: new Map(), lastSummary: "No team run yet." };

  function node(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  const gate = document.getElementById("liveAgentAuthGate");
  if (!gate || !window.fetch) return;

  const panel = node("section", "live-agent-monitor");
  panel.setAttribute("aria-label", "Live specialist activity monitor");
  const head = node("div", "live-agent-monitor-head");
  const heading = node("strong", "", "LIVE AGENT ACTIVITY");
  const liveCount = node("span", "live-agent-livecount", "IDLE");
  liveCount.id = "liveAgentLiveCount";
  head.append(heading, liveCount);
  const summary = node("div", "live-multi-hint", "No team run yet. Select at least three specialists and run the team.");
  summary.id = "liveAgentMonitorSummary";
  summary.setAttribute("aria-live", "polite");
  const progress = node("div", "live-agent-progress");
  progress.setAttribute("aria-label", "Agent completion progress");
  const progressFill = node("span", "");
  progress.append(progressFill);
  const activity = node("div", "live-agent-activity");
  activity.id = "liveAgentActivityRows";
  const foot = node("p", "live-agent-footnote", "Live states come from the server's actual specialist requests. Market-data validation happens first; completed reports and failures are shown individually. Paper analysis only — no exchange order is sent.");
  foot.style.marginBottom = "0";
  panel.append(head, summary, progress, activity, foot);
  gate.parentNode.insertBefore(panel, gate);

  function counts() {
    const values = Array.from(state.agents.values());
    return {
      total: values.length,
      running: values.filter(a => a.status === "running").length,
      complete: values.filter(a => a.status === "complete").length,
      failed: values.filter(a => a.status === "error").length,
      blocked: values.filter(a => a.status === "blocked").length,
      queued: values.filter(a => a.status === "queued").length
    };
  }

  function render() {
    const c = counts();
    if (c.running > 0) {
      liveCount.textContent = c.running + " WORKING";
      liveCount.classList.add("active");
    } else {
      liveCount.classList.remove("active");
      if (state.phase === "market" || state.phase === "validation") liveCount.textContent = "PREPARING";
      else if (state.phase === "dispatch") liveCount.textContent = "DISPATCHING";
      else if (state.phase === "complete") liveCount.textContent = c.failed ? "DONE · ERRORS" : "COMPLETE";
      else if (state.phase === "blocked") liveCount.textContent = "BLOCKED";
      else liveCount.textContent = "IDLE";
    }

    let percentage = c.total ? Math.round((c.complete + c.failed + c.blocked) / c.total * 100) : 0;
    progressFill.style.width = percentage + "%";
    progressFill.setAttribute("aria-valuenow", String(percentage));
    progressFill.setAttribute("role", "progressbar");
    progressFill.setAttribute("aria-valuemin", "0");
    progressFill.setAttribute("aria-valuemax", "100");

    if (state.phase === "validation") {
      summary.textContent = "Checking the private session and validating the requested agent roles. 0 agent calls confirmed running.";
    } else if (state.phase === "market") {
      summary.textContent = "Verifying fresh exchange candles and higher-timeframe data before dispatch. Agent calls have not started yet.";
    } else if (state.phase === "dispatch") {
      summary.textContent = c.running + " of " + c.total + " specialists currently running · " + c.complete + " complete · " + c.failed + " failed.";
    } else if (state.phase === "complete") {
      summary.textContent = c.complete + "/" + c.total + " specialist reports completed · " + c.failed + " failed · " + c.blocked + " not started." + (state.lastSummary && state.lastSummary !== "Team request finished." ? " " + state.lastSummary : "");
    } else if (state.phase === "blocked") {
      summary.textContent = state.lastSummary + " No agent execution was confirmed.";
    } else {
      summary.textContent = state.lastSummary;
    }

    activity.replaceChildren();
    for (const agent of state.agents.values()) {
      const row = node("div", "live-agent-activity-row" + (agent.status === "running" ? " running" : agent.status === "complete" ? " done" : agent.status === "error" ? " error" : ""));
      const dot = node("span", "live-agent-activity-dot");
      const main = node("div", "");
      const name = node("strong", "", agent.name);
      name.style.display = "block";
      const focusText = agent.status === "error" && agent.errorText ? "Failed: " + agent.errorText : agent.status === "blocked" && agent.errorText ? "Not started: " + agent.errorText : agent.focus || "Analyzing the verified market snapshot.";
      const focus = node("span", "", focusText);
      main.append(name, focus);
      const stateLabel = agent.status === "running" ? "WORKING" :
        agent.status === "complete" ? ("DONE" + (agent.bias && agent.bias !== "WAIT" ? " · " + agent.bias : "")) :
        agent.status === "error" ? "FAILED" :
        agent.status === "blocked" ? "NOT STARTED" : "QUEUED";
      const right = node("span", "live-agent-activity-state", stateLabel);
      row.append(dot, main, right);
      activity.append(row);
    }
  }

  function reset(roles) {
    state.phase = "validation";
    state.roles = roles.slice();
    state.agents = new Map();
    state.lastSummary = "Starting a new team run.";
    for (const role of roles) {
      const info = roleInfo[role] || { name: role, focus: "Specialist analysis." };
      state.agents.set(role, { role, name: info.name, focus: info.focus, status: "queued" });
    }
    render();
  }

  function receive(event) {
    if (!event || typeof event !== "object") return;
    if (event.type === "phase") {
      state.phase = event.phase === "validation" ? "validation" :
        event.phase === "market" ? "market" :
        event.phase === "agents" ? "dispatch" : state.phase;
      if (Array.isArray(event.roles)) {
        for (const item of event.roles) {
          const prev = state.agents.get(item.role) || { role: item.role, status: "queued" };
          state.agents.set(item.role, {
            ...prev,
            name: item.name || prev.name || item.role,
            focus: item.focus || prev.focus || ""
          });
        }
      }
      render();
      return;
    }
    if (event.type === "agent" && event.role) {
      const prev = state.agents.get(event.role) || {
        role: event.role, name: event.result?.name || roleInfo[event.role]?.name || event.role,
        focus: roleInfo[event.role]?.focus || "", status: "queued"
      };
      if (event.result) {
        prev.name = event.result.name || prev.name;
        prev.bias = event.result.bias || "WAIT";
        prev.elapsedMs = event.result.elapsedMs;
        prev.errorText = event.result.ok === false ? (event.result.text || "Specialist request failed.") : "";
      }
      prev.status = event.status === "running" ? "running" : event.status === "error" ? "error" : "complete";
      state.agents.set(event.role, prev);
      state.phase = "dispatch";
      render();
      return;
    }
    if (event.type === "complete" || event.type === "failure") {
      const data = event.data && typeof event.data === "object" ? event.data : {};
      const results = Array.isArray(data.results) ? data.results : [];
      for (const result of results) {
        const prev = state.agents.get(result.role) || {
          role: result.role, name: result.name || roleInfo[result.role]?.name || result.role,
          focus: roleInfo[result.role]?.focus || ""
        };
        prev.name = result.name || prev.name;
        prev.bias = result.bias || "WAIT";
        prev.elapsedMs = result.elapsedMs;
        prev.status = result.ok === false ? "error" : "complete";
        prev.errorText = result.ok === false ? (result.text || "Specialist request failed.") : "";
        state.agents.set(result.role, prev);
      }
      if (event.type === "failure" && results.length === 0) {
        const why = String(data.error || "The server could not start this run.");
        for (const agent of state.agents.values()) {
          if (agent.status === "queued") {
            agent.status = "blocked";
            agent.errorText = why;
          } else if (agent.status === "running") {
            agent.status = "error";
            agent.errorText = why;
          }
        }
        state.phase = "blocked";
        state.lastSummary = why;
      } else if (event.type === "failure") {
        const why = String(data.error || "The specialist providers did not return a usable report.");
        for (const agent of state.agents.values()) {
          if (agent.status === "queued") {
            agent.status = "blocked";
            agent.errorText = why;
          } else if (agent.status === "running") {
            agent.status = "error";
            agent.errorText = why;
          }
        }
        state.phase = "complete";
        state.lastSummary = "Agents ran, but this team run failed: " + why;
      } else {
        for (const agent of state.agents.values()) {
          if (agent.status === "queued") {
            agent.status = "blocked";
            agent.errorText = "No server completion event was received for this specialist.";
          } else if (agent.status === "running") {
            agent.status = "error";
            agent.errorText = "The team response ended before this specialist completed.";
          }
        }
        state.phase = "complete";
        state.lastSummary = "Team request finished.";
      }
      render();
    }
  }

  function localFailure(error) {
    const message = error && error.message ? error.message : String(error || "Request failed.");
    for (const agent of state.agents.values()) {
      if (agent.status === "running") {
        agent.status = "error";
        agent.errorText = message;
      } else if (agent.status === "queued") {
        agent.status = "blocked";
        agent.errorText = message;
      }
    }
    state.phase = "blocked";
    state.lastSummary = "Connection interrupted: " + message;
    render();
  }

  function getUrl(input) {
    try { return new URL(typeof input === "string" ? input : input.url, window.location.href); }
    catch (_) { return null; }
  }

  window.fetch = async function(input, init) {
    const url = getUrl(input);
    const method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
    if (!url || url.pathname !== endpoint || method !== "POST") return originalFetch(input, init);

    let requestBody = init && init.body;
    if (requestBody === undefined && input instanceof Request) {
      try { requestBody = await input.clone().text(); } catch (_) { requestBody = ""; }
    }
    let payload = {};
    try { payload = typeof requestBody === "string" ? JSON.parse(requestBody) : {}; } catch (_) {}
    const roles = Array.isArray(payload.roles) ? payload.roles.filter(role => typeof role === "string") : [];
    reset(roles);

    const headers = new Headers((init && init.headers) || (input instanceof Request ? input.headers : undefined));
    headers.set("Accept", "text/event-stream");
    const nextInit = { ...(init || {}), method: "POST", headers };

    try {
      const response = await originalFetch(input, nextInit);
      if (!response.headers.get("content-type")?.includes("text/event-stream") || !response.body) {
        const body = await response.clone().json().catch(() => ({}));
        if (!response.ok) receive({ type: "failure", status: response.status, data: body });
        else receive({ type: "complete", status: response.status, data: body });
        return response;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let terminal = null;
      function parseFrame(frame) {
        const lines = frame.split(/\r?\n/);
        const dataLines = lines.filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart());
        if (!dataLines.length) return;
        try {
          const event = JSON.parse(dataLines.join("\n"));
          receive(event);
          if (event.type === "complete" || event.type === "failure") terminal = event;
        } catch (_) {}
      }

      while (true) {
        const part = await reader.read();
        if (part.done) break;
        buffer += decoder.decode(part.value, { stream: true });
        let boundary;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          parseFrame(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 2);
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) parseFrame(buffer);
      if (!terminal) throw new Error("The activity stream ended before the server sent a final result.");

      const finalData = terminal.data && typeof terminal.data === "object" ? terminal.data : {};
      const finalStatus = Number(terminal.status) || (terminal.type === "failure" ? 502 : 200);
      return new Response(JSON.stringify(finalData), {
        status: finalStatus,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
      });
    } catch (error) {
      localFailure(error);
      throw error;
    }
  };

  window.tarotaiAgentMonitor = {
    getState: () => ({
      phase: state.phase,
      agents: Array.from(state.agents.values()).map(agent => ({
        role: agent.role, name: agent.name, status: agent.status, bias: agent.bias
      })),
      counts: counts()
    })
  };
  render();
})();
