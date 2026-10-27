"use client";

import { useEffect, useState, type CSSProperties } from "react";

type Availability = "checking" | "available" | "unavailable";

export default function DownloadButton() {
  const [availability, setAvailability] = useState<Availability>("checking");

  useEffect(() => {
    const controller = new AbortController();
    const check = async () => {
      try {
        const response = await fetch("/TarotAI.apk", {
          method: "HEAD",
          cache: "no-store",
          signal: controller.signal,
        });
        const type = (response.headers.get("content-type") || "").toLowerCase();
        const validType =
          type.includes("application/vnd.android.package-archive") ||
          type.includes("application/octet-stream");
        setAvailability(response.ok && validType ? "available" : "unavailable");
      } catch {
        if (!controller.signal.aborted) setAvailability("unavailable");
      }
    };
    void check();
    return () => controller.abort();
  }, []);

  if (availability === "checking") {
    return (
      <button type="button" disabled aria-live="polite" style={buttonStyle("#23303d", "#aab6c4")}>
        Checking APK availability…
      </button>
    );
  }

  if (availability === "unavailable") {
    return (
      <div role="status" aria-live="polite" style={{ display: "grid", gap: 8 }}>
        <button type="button" disabled style={buttonStyle("#23303d", "#aab6c4")}>
          APK build not published yet
        </button>
        <span style={{ color: "#8e9aaa", fontSize: 12, lineHeight: 1.6 }}>
          The download button will become available after the Android build has completed and been published to this website.
        </span>
      </div>
    );
  }

  return (
    <a href="/TarotAI.apk" download="TarotAI.apk" style={buttonStyle("#72e6b0", "#061018")}>
      Download Android APK
    </a>
  );
}

function buttonStyle(background: string, color: string): CSSProperties {
  return {
    display: "flex",
    boxSizing: "border-box",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    minHeight: 54,
    border: 0,
    borderRadius: 12,
    background,
    color,
    font: "inherit",
    fontWeight: 850,
    textDecoration: "none",
    padding: "13px 18px",
    cursor: background === "#72e6b0" ? "pointer" : "default",
  };
}
