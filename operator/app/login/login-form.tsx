"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

export default function LoginForm() {
  const searchParams = useSearchParams();
  const requestedNext = searchParams.get("next") || "/";\n  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/";
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      setError("That password did not work.");
      setBusy(false);
      return;
    }

    window.location.href = next;
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label htmlFor="password">Owner password</label>
      <input
        id="password"
        autoComplete="current-password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.currentTarget.value)}
        placeholder="Enter your private password"
      />
      {error ? <div className="error">{error}</div> : null}
      <button type="submit" disabled={busy || password.length === 0}>
        {busy ? "Unlocking…" : "Enter Operator"}
      </button>
    </form>
  );
}