"use client";

import { useMemo, useState } from "react";
import { useEveAgent } from "eve/react";\nimport InputRequest, { getInputRequest } from "./input-request";

const QUICK_TASKS = [
  "Audit PCDealHub for broken links, stale deal data, and deployment problems. Fix safe issues and report anything requiring approval.",
  "Find new clean PC hardware deals in India and prepare additions that meet PCDealHub's exact-model and verification rules.",
  "Inspect the PCDealHub homepage on mobile and improve anything that clearly hurts usability or performance. Test the result.",
  "Research one useful SEO or traffic improvement for PCDealHub, implement safe changes, and verify them.",
];

export default function OperatorConsole() {
  const agent = useEveAgent({ prewarm: true });
  const [input, setInput] = useState("");
  const [taskStarted, setTaskStarted] = useState(false);
  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  const messageCount = agent.data.messages.length;

  const latestAssistantText = useMemo(() => {
    const message = [...agent.data.messages]
      .reverse()
      .find((item) => item.role === "assistant");
    if (!message) return "";
    return message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .slice(0, 700);
  }, [agent.data.messages]);

  async function send(message: string) {
    const value = message.trim();
    if (!value || isBusy) return;
    setTaskStarted(true);
    setInput("");
    await agent.send(value);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await send(input);
  }

  return (
    <main className="operator-shell">
      <aside className="sidebar">
        <div>
          <div className="brand-mark">PDH</div>
          <div className="eyebrow">PRIVATE OPERATOR</div>
          <h2>PCDealHub</h2>
          <p className="muted">Autonomous research, editing, testing and maintenance.</p>
        </div>

        <div className="sidebar-card">
          <div className="status-row"><span className={isBusy ? "dot active" : "dot"} /><span>{isBusy ? "Working" : "Ready"}</span></div>
          <div className="stat"><span>Session messages</span><strong>{messageCount}</strong></div>
          <div className="stat"><span>Execution mode</span><strong>Autonomous</strong></div>
        </div>

        <div className="sidebar-card">
          <div className="eyebrow">QUICK TASKS</div>
          <div className="quick-list">
            {QUICK_TASKS.map((task) => (
              <button key={task} onClick={() => void send(task)} disabled={isBusy}>{task}</button>
            ))}
          </div>
        </div>

        <form action="/api/auth/logout" method="post" className="logout">
          <button type="submit">Lock Operator</button>
        </form>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">OWNER CONTROL CENTER</div>
            <h1>Give the Operator a job.</h1>
          </div>
          <div className="topbar-badge">Private · owner only</div>
        </header>

        <div className="workspace-grid">
          <section className="chat-panel">
            <div className="chat-scroll">
              {agent.data.messages.length === 0 ? (
                <div className="empty-state">
                  <div className="hero-orb">✦</div>
                  <h2>Ready when you are.</h2>
                  <p>Tell it the outcome you need. The Operator is instructed to inspect, research, execute, test, fix, and verify rather than stopping at advice.</p>
                </div>
              ) : (
                agent.data.messages.map((message) => (
                  <article key={message.id} className={`message-card ${message.role === "user" ? "user" : "assistant"}`}>
                    <div className="message-role">{message.role === "user" ? "YOU" : "OPERATOR"}</div>
                    {message.parts.map((part, index) => {
                      if (part.type === "text") return <p key={index}>{part.text}</p>;
                      if (part.type === "reasoning" && part.text?.trim()) return <div className="tool-chip" key={index}>Thinking summary</div>;
                      return <div className="tool-chip" key={index}>{part.type.replaceAll("-", " ")}</div>;
                    })}
                  </article>
                ))
              )}
            </div>

            <form className="composer" onSubmit={submit}>
              <textarea value={input} onChange={(event) => setInput(event.currentTarget.value)} placeholder="Tell the Operator the outcome you want…" rows={3} disabled={isBusy} />
              <div className="composer-row">
                <span>{isBusy ? "Executing…" : "Research → act → test → verify"}</span>
                <button type="submit" disabled={isBusy || input.trim().length === 0}>{isBusy ? "Working…" : "Run task"}</button>
              </div>
            </form>
          </section>

          <aside className="activity-panel">
            <div className="eyebrow">ACTIVITY</div>
            <h3>Operator state</h3>
            <div className="activity-status"><span className={isBusy ? "pulse" : "dot"} /><strong>{isBusy ? "Agent is executing" : "Standing by"}</strong></div>
            <p className="muted">{taskStarted ? "The current conversation is durable, so context can survive reloads and later turns." : "Start with a concrete outcome. The agent can research unfamiliar subjects without retraining."}</p>
            <div className="activity-card">
              <div className="eyebrow">LATEST RESULT</div>
              <p>{latestAssistantText || "No completed task yet."}</p>
            </div>
            <div className="activity-card">
              <div className="eyebrow">GUARDRAILS</div>
              <ul>
                <li>Owner-only console.</li>
                <li>GitHub writes are approval-gated.</li>
                <li>Destructive actions require explicit approval.</li>
                <li>Current facts are researched from live sources.</li>
              </ul>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}