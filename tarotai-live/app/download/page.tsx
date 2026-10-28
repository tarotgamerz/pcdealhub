import DownloadButton from "./DownloadButton";

export const metadata = {
  title: "Get TarotAI for Android",
  description: "Install the TarotAI Android app from the official TarotAI website.",
};

export default function DownloadPage() {
  return (
    <main style={{ minHeight: "100dvh", padding: "28px 16px", display: "grid", placeItems: "center", background: "radial-gradient(circle at 80% 0%, #182333 0, #070a0f 42%)", color: "#edf2f7", fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" }}>
      <section style={{ width: "min(560px, 100%)", padding: "clamp(22px, 6vw, 42px)", border: "1px solid #283443", borderRadius: 22, background: "rgba(13, 18, 26, 0.96)", boxShadow: "0 24px 70px rgba(0,0,0,.35)" }}>
        <a href="/" style={{ color: "#aab6c4", textDecoration: "none", fontSize: 13 }}>← Back to TarotAI</a>
        <div aria-hidden="true" style={{ width: 54, height: 54, marginTop: 24, borderRadius: 16, display: "grid", placeItems: "center", background: "linear-gradient(135deg, #72e6b0, #6fa8ff)", color: "#061018", fontWeight: 900, fontSize: 24 }}>T</div>
        <p style={{ color: "#72e6b0", fontSize: 12, fontWeight: 800, letterSpacing: ".16em", marginTop: 24, textTransform: "uppercase" }}>TarotAI · Android</p>
        <h1 style={{ fontSize: "clamp(30px, 7vw, 42px)", lineHeight: 1.08, margin: "8px 0 12px" }}>Your trading command center, in your pocket.</h1>
        <p style={{ color: "#aab6c4", lineHeight: 1.7, marginBottom: 24 }}>Install the TarotAI app and access your existing workspace from your Android home screen. The app requires an internet connection and your usual TarotAI sign-in or access code.</p>
        <DownloadButton />
        <p style={{ color: "#8e9aaa", fontSize: 12, lineHeight: 1.65, marginTop: 15 }}>Only install the APK served from this official TarotAI website. Android may ask you to allow installation from your browser. The app does not contain exchange API keys or provider secrets.</p>
        <div style={{ borderTop: "1px solid #283443", marginTop: 26, paddingTop: 18 }}>
          <p style={{ color: "#718096", fontSize: 12, lineHeight: 1.6 }}>If the download does not start, the first APK build may not have been published yet. Please try again after the build is available.</p>
        </div>
      </section>
    </main>
  );
}
