"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "Login failed.");
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <main className="op-login">
      <section className="op-login-card">
        <div className="op-brand">
          <span className="op-logo">P</span>
          <span>PCDealHub Operator</span>
        </div>
        <span className="op-badge">OWNER ONLY</span>
        <h1>Private control room</h1>
        <p>This console is the private door to the autonomous Operator.</p>
        <form onSubmit={submit}>
          <label htmlFor="operator-password">Owner password</label>
          <input
            id="operator-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your operator password"
          />
          {error ? <div className="op-error">{error}</div> : null}
          <button className="op-btn primary" type="submit">Enter Operator</button>
        </form>
      </section>
    </main>
  );
}
