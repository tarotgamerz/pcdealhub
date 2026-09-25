"use client";

import { useState } from "react";
import { useEveAgent } from "eve/react";

type Part = { type?: string; text?: string };
type Message = { role: string; parts?: Part[] };

const examples = [
  "Inspect PCDealHub and tell me what needs attention. Do not change anything.",
  "Check the site's latest validation and deployment state and investigate failures if any.",
  "Research a current PC hardware topic I don't understand, then explain it with sources.",
];

function textOf(message: Message) {
  return (message.parts ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n");
}

export function OperatorConsole() {
  const agent = useEveAgent();
  const [command, setCommand] = useState("");
  const [tab, setTab] = useState("command");
  const [paused, setPaused] = useState(false);

  async function run() {
    const value = command.trim();
    if (!value || paused) return;
    setCommand("");
    await agent.send(value);
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.assign("/login");
  }

  const messages = (agent.data?.messages ?? []) as Message[];
  const status = agent.status ?? "ready";
  const busy = status === "submitted" || status === "streaming";

  return (
    <div className="op-shell">
      <aside className="op-side">
        <div className="op-brand"><span className="op-logo">P</span><span>PCDealHub Operator</span></div>
        <span className="op-badge">PRIVATE · OWNER</span>
        <nav className="op-nav">
          {[
            ["command", "Command"],
            ["memory", "Memory"],
            ["tasks", "Tasks"],
            ["safety", "Safety"],
          ].map(([id, label]) => (
            <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>

        <div className="op-card" style={{ marginTop: 18 }}>
          <div className="op-kv"><span>Runtime</span><span className="op-pill good">Eve</span></div>
          <div className="op-kv" style={{ marginTop: 8 }}><span>Session</span><span className="op-pill good">{status}</span></div>
          <div className="op-kv" style={{ marginTop: 8 }}><span>New tasks</span><span className={"op-pill " + (paused ? "locked" : "good")}>{paused ? "PAUSED" : "READY"}</span></div>
        </div>

        <button className="op-btn danger" style={{ width: "100%", marginTop: 10 }} onClick={logout}>Sign out</button>
      </aside>

      <main className="op-main">
        <header className="op-top">
          <div className="op-title">
            <h1>{tab === "command" ? "Operator command center" : tab[0].toUpperCase() + tab.slice(1)}</h1>
            <p>Research → execute → test → fix → verify → remember.</p>
          </div>
          <div className="op-status"><span className="op-dot"></span>{status}</div>
        </header>

        {tab === "command" ? (
          <div className="op-grid">
            <section className="op-card">
              <h2>Give the Operator a task</h2>
              <p className="op-muted">Use natural language. It should inspect current state, research missing knowledge, act with available tools, verify the result, and report evidence.</p>
              <textarea
                className="op-command"
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") void run();
                }}
                placeholder="Example: Fix the PCDealHub mobile layout and verify it."
                disabled={paused || busy}
              />
              <div className="op-actions">
                <button className="op-btn" type="button" onClick={() => setCommand(examples[0])}>Example task</button>
                <button className="op-btn primary" type="button" onClick={() => void run()} disabled={!command.trim() || paused || busy}>Run task</button>
              </div>
            </section>

            <section className="op-card">
              <h2>Operating contract</h2>
              <div className="op-list">
                <div className="op-item">Live research for unfamiliar/current knowledge.</div>
                <div className="op-item">Sandboxed code execution and file work.</div>
                <div className="op-item">Tests and browser verification after changes.</div>
                <div className="op-item">Protected durable memory.</div>
                <div className="op-item">Approval before destructive or consequential actions.</div>
              </div>
            </section>

            <section className="op-card" style={{ gridColumn: "1 / -1" }}>
              <h2>Session stream</h2>
              <div className="op-feed">
                {messages.length === 0 ? (
                  <div className="op-empty">
                    <strong>No task run yet.</strong><br />
                    Start with an example, or type your own command.
                  </div>
                ) : messages.map((message, index) => (
                  <article key={index} className={"op-msg " + message.role}>
                    <div className="op-msg-role">{message.role}</div>
                    <div className="op-msg-text">{textOf(message)}</div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        ) : tab === "memory" ? (
          <section className="op-card">
            <h2>Protected memory</h2>
            <p className="op-muted">Owner preferences stay outside the public PCDealHub repository. Project-safe facts can live in versioned files; private owner memory belongs in the protected runtime store.</p>
            <div className="op-list" style={{ marginTop: 12 }}>
              <div className="op-item"><div className="op-kv"><span>Owner profile</span><span className="op-pill good">PRIVATE</span></div></div>
              <div className="op-item"><div className="op-kv"><span>Project facts</span><span className="op-pill good">VERSIONED</span></div></div>
              <div className="op-item"><div className="op-kv"><span>Task notes</span><span className="op-pill warn">TEMPORARY</span></div></div>
            </div>
          </section>
        ) : tab === "tasks" ? (
          <section className="op-card">
            <h2>Task monitor</h2>
            <div className="op-list">
              <div className="op-item"><div className="op-kv"><span>Current session</span><span className="op-pill good">{status}</span></div></div>
              <div className="op-item"><div className="op-kv"><span>GitHub writes</span><span className="op-pill warn">APPROVAL</span></div></div>
              <div className="op-item"><div className="op-kv"><span>External messages</span><span className="op-pill warn">APPROVAL</span></div></div>
            </div>
          </section>
        ) : (
          <section className="op-card">
            <h2>Safety controls</h2>
            <p className="op-muted">This pause control blocks new commands in the UI. The final runtime version will also persist the stop state server-side so scheduled and resumed work obeys it.</p>
            <button className={"op-btn " + (paused ? "primary" : "danger")} type="button" onClick={() => setPaused((value) => !value)}>
              {paused ? "Resume new tasks" : "Pause new tasks"}
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
