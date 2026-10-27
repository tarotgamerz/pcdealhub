const APK_URL =
  "https://github.com/tarotgamerz/pcdealhub/releases/latest/download/TarotAI.apk";
const RELEASES_URL = "https://github.com/tarotgamerz/pcdealhub/releases";

export const metadata = {
  title: "TarotAI for Android",
  description: "Download the TarotAI Android app installer.",
};

export default function DownloadPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        padding: "32px 18px",
        display: "grid",
        placeItems: "center",
        background:
          "radial-gradient(circle at 80% 0%, #182333 0, #070a0f 42%)",
        color: "#edf2f7",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      }}
    >
      <section
        style={{
          width: "min(560px, 100%)",
          padding: "clamp(22px, 6vw, 42px)",
          border: "1px solid #283443",
          borderRadius: 22,
          background: "rgba(13, 18, 26, 0.94)",
          boxShadow: "0 24px 70px rgba(0,0,0,.35)",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            display: "grid",
            placeItems: "center",
            background: "linear-gradient(135deg, #72e6b0, #6fa8ff)",
            color: "#061018",
            fontWeight: 900,
            fontSize: 23,
          }}
        >
          T
        </div>
        <p
          style={{
            color: "#72e6b0",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: ".16em",
            marginTop: 24,
            textTransform: "uppercase",
          }}
        >
          TarotAI · Android
        </p>
        <h1 style={{ fontSize: "clamp(30px, 7vw, 42px)", lineHeight: 1.08, margin: "8px 0 12px" }}>
          Your trading command center, in your pocket.
        </h1>
        <p style={{ color: "#aab6c4", lineHeight: 1.7, marginBottom: 24 }}>
          Install the TarotAI Android app to open your private command center
          from your home screen. An internet connection and your normal TarotAI
          sign-in/access code are required.
        </p>
        <a
          href={APK_URL}
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: 52,
            borderRadius: 12,
            background: "#72e6b0",
            color: "#061018",
            fontWeight: 850,
            textDecoration: "none",
            padding: "13px 18px",
          }}
        >
          Download latest APK
        </a>
        <p style={{ color: "#8e9aaa", fontSize: 12, lineHeight: 1.6, marginTop: 15 }}>
          Android may ask you to allow installation from this source. Only
          install an APK published under the official TarotAI repository below.
        </p>
        <div style={{ borderTop: "1px solid #283443", marginTop: 26, paddingTop: 18 }}>
          <a href={RELEASES_URL} style={{ color: "#9cc1ff", textDecoration: "none", fontWeight: 650 }}>
            View APK releases and build notes →
          </a>
          <p style={{ color: "#718096", fontSize: 12, lineHeight: 1.6, marginTop: 12 }}>
            The download button becomes active once the first Android build is
            published. Never enter exchange API keys anywhere except the
            official TarotAI app/backend flow; APK builds do not contain your
            exchange secrets.
          </p>
          <a href="https://tarotai-core.vercel.app/" style={{ color: "#aab6c4", fontSize: 13 }}>
            Back to TarotAI
          </a>
        </div>
      </section>
    </main>
  );
}
