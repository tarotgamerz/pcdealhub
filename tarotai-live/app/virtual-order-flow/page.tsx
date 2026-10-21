import VirtualOrderFlowChart from "@/app/components/VirtualOrderFlowChart";

export const metadata = {
  title: "TarotAI · Virtual Order Flow",
  description: "Private virtual order-flow chart with live market data, trade bubbles and Grok forecast overlay.",
  robots: { index: false, follow: false },
};

export default function VirtualOrderFlowPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#05080d", padding: "clamp(8px, 2vw, 24px)" }}>
      <div style={{ width: "100%", maxWidth: 1500, margin: "0 auto" }}>
        <a href="/virtual.html" style={{ display: "inline-block", color: "#91a2b7", fontSize: 12, margin: "0 0 12px" }}>
          ← Existing order-flow workspace
        </a>
        <VirtualOrderFlowChart />
      </div>
    </main>
  );
}
