"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Interval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "1d";
type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number; closeTime?: number };
type Bubble = { id: string; time: number; price: number; quantity: number; buyerInitiated: boolean };
type ForecastResponse = {
  ok: boolean; error?: string; symbol: string; interval: string; dataAsOf: string;
  forecast: { bias: "BULLISH" | "BEARISH" | "RANGE_BOUND" | "NO_EDGE"; confidencePct: number | null; summary: string; horizon: string; invalidation: string };
  independentHeuristicBaseline?: { projectedPrice?: number; projectedChangePct?: number; direction?: string };
};
type MarketResponse = { candles?: Candle[]; stale?: boolean; error?: string; detail?: string };
type TestnetResponse = { accepted?: boolean; liveTradingEnabled?: boolean; error?: string; reason?: string; order?: { orderId: string | number; status: string; side: string; symbol: string; origQty: string; avgPrice: string } };

const DURATIONS: Record<Interval, number> = { "1m":60000, "3m":180000, "5m":300000, "15m":900000, "30m":1800000, "1h":3600000, "2h":7200000, "4h":14400000, "1d":86400000 };
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"];
const panel: React.CSSProperties = { background:"#0b121b", border:"1px solid #263548", borderRadius:10, padding:12, minWidth:0 };
const button: React.CSSProperties = { color:"#e8f0f8", background:"#132131", border:"1px solid #34465d", borderRadius:8, padding:"9px 11px", minHeight:38, fontWeight:700 };
const input: React.CSSProperties = { color:"#e8f0f8", background:"#0b1119", border:"1px solid #304258", borderRadius:8, padding:"9px 10px", width:"100%", minWidth:0, minHeight:38 };
const muted: React.CSSProperties = { color:"#91a2b7", fontSize:11, lineHeight:1.5 };
const isFiniteNumber = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const fmt = (n: number) => Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits:n < 1 ? 6 : 2, minimumFractionDigits:n < 1 ? 4 : 2 }) : "—";
const orderId = () => "ta" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export default function VirtualOrderFlowChart() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const candlesRef = useRef<Candle[]>([]);
  const bubblesRef = useRef<Bubble[]>([]);
  const forecastRef = useRef<ForecastResponse | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const latestPriceRef = useRef(NaN);
  const lastTradeRef = useRef(0);
  const lastCandleRef = useRef(0);
  const dimensionsRef = useRef({ width:0, height:0, dpr:1 });

  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setIntervalValue] = useState<Interval>("1m");
  const [price, setPrice] = useState(NaN);
  const [status, setStatus] = useState("Loading market data…");
  const [stale, setStale] = useState(true);
  const [tradeAge, setTradeAge] = useState("—");
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [forecastBusy, setForecastBusy] = useState(false);
  const [forecastStatus, setForecastStatus] = useState("No forecast requested");
  const [showTicket, setShowTicket] = useState(false);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [quantity, setQuantity] = useState("0.001");
  const [limitPrice, setLimitPrice] = useState("");
  const [confirmedDemo, setConfirmedDemo] = useState(false);
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderStatus, setOrderStatus] = useState("");
  const [orderError, setOrderError] = useState(false);

  const draw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const canvas = canvasRef.current;
      const { width, height, dpr } = dimensionsRef.current;
      const ctx = canvas?.getContext("2d", { alpha:false });
      if (!canvas || !ctx || width < 50 || height < 100) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#070c13"; ctx.fillRect(0, 0, width, height);
      const rows = candlesRef.current;
      if (rows.length < 2) {
        ctx.fillStyle = "#91a2b7"; ctx.font = "12px system-ui"; ctx.fillText("Waiting for candle history…", 14, 26); return;
      }
      const visible = rows.slice(-Math.min(84, rows.length));
      const last = visible[visible.length - 1];
      const horizonMs = DURATIONS[interval];
      const projection = forecastRef.current?.independentHeuristicBaseline?.projectedPrice;
      const projected = isFiniteNumber(projection) && projection > 0 ? projection : null;
      const left = 12, right = Math.max(55, width - 68), top = 16, bottom = height - 25;
      const pw = right - left, ph = bottom - top;
      let lo = Math.min(...visible.map(c => c.low)), hi = Math.max(...visible.map(c => c.high));
      if (projected !== null) { lo = Math.min(lo, projected); hi = Math.max(hi, projected); }
      const rawRange = Math.max(hi - lo, Math.abs(last.close) * 0.0005, 1e-8);
      lo -= rawRange * 0.09; hi += rawRange * 0.09;
      const range = hi - lo;
      const y = (p:number) => bottom - (p - lo) / range * ph;
      const firstTime = visible[0].time, lastTime = last.time + horizonMs * 10, timeRange = Math.max(1, lastTime - firstTime);
      const x = (t:number) => left + (t - firstTime) / timeRange * pw;
      const candleW = Math.max(2, Math.min(9, horizonMs / timeRange * pw * 0.7));
      ctx.strokeStyle = "#182332"; ctx.lineWidth = 1; ctx.fillStyle = "#91a2b7"; ctx.font = "10px ui-monospace,monospace";
      for (let i=0;i<=4;i++) {
        const yy = top + ph*i/4;
        ctx.beginPath(); ctx.moveTo(left,yy); ctx.lineTo(right,yy); ctx.stroke();
        ctx.fillText(fmt(hi - range*i/4), right+5, yy+3);
      }
      for (const c of visible) {
        const cx=x(c.time), up=c.close>=c.open, color=up?"#4bd6a0":"#ff7e91";
        ctx.strokeStyle=color; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(cx,y(c.high)); ctx.lineTo(cx,y(c.low)); ctx.stroke();
        ctx.fillStyle=color; ctx.fillRect(cx-candleW/2,Math.min(y(c.open),y(c.close)),candleW,Math.max(1,Math.abs(y(c.open)-y(c.close))));
      }
      const cutoff=Date.now()-8*60_000;
      for (const b of bubblesRef.current) {
        if (b.time<cutoff || b.price<lo-rawRange || b.price>hi+rawRange) continue;
        const bx=x(b.time); if (bx<left || bx>right) continue;
        const notional=b.price*b.quantity, radius=Math.max(2.2,Math.min(13,2+Math.log10(1+notional)*1.55));
        ctx.beginPath(); ctx.arc(bx,y(b.price),radius,0,Math.PI*2);
        ctx.fillStyle=b.buyerInitiated?"rgba(75,214,160,.23)":"rgba(255,126,145,.23)"; ctx.fill();
        ctx.strokeStyle=b.buyerInitiated?"rgba(75,214,160,.9)":"rgba(255,126,145,.9)"; ctx.stroke();
      }
      if (forecastRef.current && projected !== null) {
        const bias=forecastRef.current.forecast?.bias || "NO_EDGE";
        const color=bias==="BULLISH"?"#5ce1a4":bias==="BEARISH"?"#ff7788":"#e9cb71";
        const startX=x(last.time), endX=Math.min(right-2,startX+pw/94*3), startY=y(last.close), endY=y(projected);
        ctx.save(); ctx.setLineDash([6,4]); ctx.strokeStyle=color; ctx.lineWidth=2.5;
        ctx.beginPath(); ctx.moveTo(startX,startY); ctx.lineTo(endX,endY); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle=color; ctx.beginPath(); ctx.arc(endX,endY,3.5,0,Math.PI*2); ctx.fill();
        ctx.font="bold 10px system-ui"; ctx.textAlign="right"; ctx.fillText("GROK / BASELINE",right-4,Math.max(top+10,endY-8)); ctx.restore();
      }
      const live=Number.isFinite(latestPriceRef.current)?latestPriceRef.current:last.close, liveY=y(live);
      ctx.save(); ctx.setLineDash([3,3]); ctx.strokeStyle="#9bb2cc"; ctx.beginPath(); ctx.moveTo(left,liveY); ctx.lineTo(right,liveY); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle="#17283a"; ctx.fillRect(right+1,liveY-9,width-right-1,18); ctx.fillStyle="#e5eef8"; ctx.font="bold 10px ui-monospace,monospace"; ctx.textAlign="left"; ctx.fillText(fmt(live),right+5,liveY+3); ctx.restore();
      ctx.fillStyle="#64758b"; ctx.font="9px system-ui"; ctx.textAlign="left"; ctx.fillText("AGGREGATED TRADES · NOT FULL DEPTH OR LIQUIDATION DATA",left,height-7);
    });
  }, [interval]);

  useEffect(() => {
    const host=hostRef.current, canvas=canvasRef.current;
    if (!host || !canvas) return;
    const resize=() => {
      const r=host.getBoundingClientRect(), dpr=Math.min(2,Math.max(1,window.devicePixelRatio||1));
      dimensionsRef.current={width:r.width,height:r.height,dpr};
      canvas.width=Math.max(1,Math.floor(r.width*dpr)); canvas.height=Math.max(1,Math.floor(r.height*dpr));
      canvas.style.width=r.width+"px"; canvas.style.height=r.height+"px"; draw();
    };
    const observer=new ResizeObserver(resize); observer.observe(host); resize();
    return () => { observer.disconnect(); if(rafRef.current!==null)cancelAnimationFrame(rafRef.current); rafRef.current=null; };
  }, [draw]);

  useEffect(() => { forecastRef.current=forecast; draw(); }, [forecast,draw]);

  useEffect(() => {
    let cancelled=false, socket:WebSocket|null=null, retry:ReturnType<typeof setTimeout>|null=null;
    let retryAttempt=0;
    const generation=++generationRef.current;
    const stop=() => {
      if(retry)clearTimeout(retry); retry=null;
      if(socket){socket.onopen=null;socket.onmessage=null;socket.onerror=null;socket.onclose=null;try{socket.close()}catch{}}
      socket=null; socketRef.current=null;
    };
    const connect=() => {
      if(cancelled || document.visibilityState!=="visible")return;
      const streams=symbol.toLowerCase()+"@aggTrade/"+symbol.toLowerCase()+"@kline_"+interval;
      socket=new WebSocket("wss://fstream.binance.com/stream?streams="+streams); socketRef.current=socket;
      socket.onopen=()=>{retryAttempt=0;if(!cancelled)setStatus("LIVE · Binance USDⓈ-M public stream");};
      socket.onmessage=(event) => {
        if(cancelled||generation!==generationRef.current)return;
        let envelope:{data?:Record<string,unknown>}; try{envelope=JSON.parse(String(event.data))}catch{return}
        const d=envelope.data; if(!d)return;
        if(d.e==="aggTrade"){
          const p=Number(d.p),q=Number(d.q),t=Number(d.T);
          if(![p,q,t].every(Number.isFinite)||p<=0||q<=0)return;
          latestPriceRef.current=p; lastTradeRef.current=t;
          bubblesRef.current.push({id:String(d.a??t),time:t,price:p,quantity:q,buyerInitiated:d.m!==true});
          if(bubblesRef.current.length>900)bubblesRef.current.splice(0,bubblesRef.current.length-900);
          draw(); return;
        }
        if(d.e==="kline"&&d.k&&typeof d.k==="object"){
          const k=d.k as Record<string,unknown>, c:Candle={time:Number(k.t),open:Number(k.o),high:Number(k.h),low:Number(k.l),close:Number(k.c),volume:Number(k.v),closeTime:Number(k.T)};
          if(![c.time,c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)||c.low<=0||c.high<c.low)return;
          const rows=candlesRef.current, idx=rows.findIndex(row=>row.time===c.time);
          if(idx>=0)rows[idx]=c;else rows.push(c); if(rows.length>260)rows.splice(0,rows.length-260);
          latestPriceRef.current=c.close; lastCandleRef.current=Date.now(); setPrice(c.close); setStale(false); draw();
        }
      };
      socket.onerror=()=>{if(!cancelled)setStatus("Stream error · reconnecting");};
      socket.onclose=()=>{if(cancelled||document.visibilityState!=="visible")return;setStatus("Stream disconnected · reconnecting");retry=setTimeout(connect,Math.min(30000,800*Math.pow(2,Math.min(retryAttempt++,5))));};
    };
    const load=async() => {
      stop(); candlesRef.current=[]; bubblesRef.current=[]; forecastRef.current=null; setForecast(null); setStale(true); setStatus("Loading candles…");
      const url="/api/exchanges/market?venue=binance&symbol="+encodeURIComponent(symbol)+"&interval="+encodeURIComponent(interval)+"&limit=220&public=1";
      try {
        const response=await fetch(url,{cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(8000)});
        const result=(await response.json()) as MarketResponse;
        if(!response.ok||!Array.isArray(result.candles))throw new Error(result.error||result.detail||"Market history unavailable (HTTP "+response.status+").");
        const valid=result.candles.filter(c=>c&&[c.time,c.open,c.high,c.low,c.close,c.volume].every(isFiniteNumber)&&c.time>0&&c.low>0&&c.high>=c.low&&c.close>0).sort((a,b)=>a.time-b.time);
        if(valid.length<20)throw new Error("Fewer than 20 valid candles were returned.");
        if(cancelled||generation!==generationRef.current)return;
        candlesRef.current=valid.slice(-260); const last=candlesRef.current[candlesRef.current.length-1];
        latestPriceRef.current=last.close; lastCandleRef.current=Date.now(); setPrice(last.close); setStale(Boolean(result.stale)); setStatus(result.stale?"History loaded · stale":"History loaded · connecting live stream"); draw(); connect();
      } catch(error) {if(!cancelled)setStatus(error instanceof Error?error.message:"Market data unavailable");}
    };
    const visibility=()=>{if(document.visibilityState==="hidden")stop();else if(!cancelled&&!socket)connect();};
    const freshness=setInterval(()=>{
      const age=lastTradeRef.current?Date.now()-lastTradeRef.current:Infinity;setTradeAge(Number.isFinite(age)?age<1000?"just now":Math.round(age/1000)+"s":"—");
      if(document.visibilityState==="visible"&&Date.now()-lastCandleRef.current>Math.max(15000,DURATIONS[interval]*2)){setStale(true);setStatus("Candle stream stale · check connection");}
      if(Number.isFinite(latestPriceRef.current))setPrice(latestPriceRef.current);
    },1000);
    document.addEventListener("visibilitychange",visibility); void load();
    return()=>{cancelled=true;document.removeEventListener("visibilitychange",visibility);clearInterval(freshness);stop();};
  }, [symbol,interval,draw]);

  const requestForecast=useCallback(async()=>{
    setForecastBusy(true);setForecastStatus("Requesting Grok forecast…");
    try{
      const r=await fetch("/api/trading/ai-forecast",{method:"POST",cache:"no-store",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({symbol,interval,horizon:3}),signal:AbortSignal.timeout(27000)});
      const data=(await r.json()) as ForecastResponse;
      if(!r.ok||!data.ok||!data.forecast)throw new Error(data.error||"Forecast failed (HTTP "+r.status+").");
      setForecast(data);forecastRef.current=data;setForecastStatus("Updated · "+data.forecast.bias+(isFiniteNumber(data.forecast.confidencePct)?" · "+data.forecast.confidencePct+"% confidence":""));draw();
    }catch(e){setForecastStatus(e instanceof Error?e.message:"Forecast unavailable");}
    finally{setForecastBusy(false);}
  },[symbol,interval,draw]);

  const submitTestnet=useCallback(async()=>{
    if(!confirmedDemo){setOrderError(true);setOrderStatus("Confirm that this is a demo/testnet order only.");return;}
    const qty=Number(quantity),px=Number(limitPrice||price);
    if(!Number.isFinite(qty)||qty<=0||!Number.isFinite(px)||px<=0){setOrderError(true);setOrderStatus("Enter a positive quantity and limit price.");return;}
    if(stale||!Number.isFinite(price)||Date.now()-lastCandleRef.current>Math.max(15000,DURATIONS[interval]*2)){setOrderError(true);setOrderStatus("Blocked: market data is stale.");return;}
    setOrderBusy(true);setOrderError(false);setOrderStatus("Submitting to the server-side demo/testnet endpoint…");
    try{
      const r=await fetch("/api/trading/testnet-order",{method:"POST",cache:"no-store",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({confirmTestnetOrder:true,clientOrderId:orderId(),symbol,side,type:"LIMIT",quantity:qty,price:px,timeInForce:"GTC"}),signal:AbortSignal.timeout(12000)});
      const data=(await r.json()) as TestnetResponse;
      if(!r.ok||!data.accepted||!data.order)throw new Error(data.error||data.reason||"Demo order rejected (HTTP "+r.status+").");
      setOrderStatus("Demo order accepted · "+data.order.status+" · ID "+data.order.orderId+" · "+data.order.side+" "+data.order.origQty+" "+data.order.symbol+". Verify status before retrying.");
    }catch(e){setOrderError(true);setOrderStatus(e instanceof Error?e.message:"Request failed. Verify order status before retrying.");}
    finally{setOrderBusy(false);}
  },[confirmedDemo,quantity,limitPrice,price,stale,interval,symbol,side]);

  const bias=forecast?.forecast?.bias||"NO_EDGE";
  const biasColor=bias==="BULLISH"?"#5ce1a4":bias==="BEARISH"?"#ff8899":"#e9cb71";
  const priceText=Number.isFinite(price)?fmt(price):"—";

  return <section aria-label="TarotAI virtual order flow chart" style={{color:"#e8f0f8",background:"#070c13",border:"1px solid #263548",borderRadius:14,overflow:"hidden",font:"13px/1.45 Inter,system-ui,sans-serif"}}>
    <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap",padding:12,borderBottom:"1px solid #263548"}}>
      <div><strong style={{fontSize:14,letterSpacing:".04em"}}>VIRTUAL ORDER FLOW · BUBBLE FOOTPRINT</strong><div style={muted}>One canvas · live candles and aggregated trades · Grok trend projection</div></div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
        <select aria-label="Market symbol" style={input} value={symbol} onChange={e=>setSymbol(e.target.value)}>{SYMBOLS.map(s=><option key={s}>{s}</option>)}</select>
        <select aria-label="Candle interval" style={input} value={interval} onChange={e=>setIntervalValue(e.target.value as Interval)}>{(Object.keys(DURATIONS) as Interval[]).map(i=><option key={i}>{i}</option>)}</select>
        <button style={{...button,background:"#173b31",borderColor:"#28654f"}} disabled={forecastBusy} onClick={requestForecast}>{forecastBusy?"Analyzing…":"Forecast with Grok"}</button>
      </div>
    </header>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:7,padding:9}}>
      {[["Last price",priceText+" USDT"],["Feed",stale?"STALE / CHECK":"LIVE"],["Last trade",tradeAge],["Bubbles",String(bubblesRef.current.length)]].map(([label,value])=><div key={label} style={panel}><div style={{...muted,textTransform:"uppercase",fontSize:9}}>{label}</div><strong style={{display:"block",marginTop:4,color:label==="Feed"?(stale?"#e9cb71":"#5ce1a4"):"#e8f0f8"}}>{value}</strong></div>)}
    </div>
    <div ref={hostRef} style={{height:"clamp(340px,58vh,620px)",minHeight:320,width:"100%",position:"relative",touchAction:"pan-y"}}>
      <canvas ref={canvasRef} role="img" aria-label="Candles with buyer and seller trade bubbles and a Grok trend line" style={{display:"block",width:"100%",height:"100%",touchAction:"pan-y"}}/>
    </div>
    <div style={{...muted,padding:"9px 12px",borderTop:"1px solid #1f2d3d",overflowWrap:"anywhere"}}><span style={{color:stale?"#e9cb71":"#5ce1a4"}}>● </span>{status} · Green bubbles = buyer initiated; red bubbles = seller initiated.</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,280px),1fr))",gap:9,padding:9}}>
      <article style={panel}>
        <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}><strong>Grok Future Trend</strong><span style={{color:biasColor,border:"1px solid "+biasColor,borderRadius:6,padding:"3px 6px",fontSize:10,fontWeight:800}}>{bias}</span></div>
        <p style={muted}>{forecast?.forecast?.summary||"Request a forecast to draw the trend projection on the chart."}</p>
        <div role="status" aria-live="polite" style={{...muted,overflowWrap:"anywhere"}}>{forecastStatus}</div>
        {forecast?.forecast?.invalidation?<p style={muted}>Invalidation: {forecast.forecast.invalidation}</p>:null}
        <p style={muted}>The projected line uses the independent heuristic baseline returned with the forecast. It is not a calibrated target or guaranteed prediction.</p>
      </article>
      <article style={panel}>
        <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}><strong>Demo execution pipeline</strong><button style={button} onClick={()=>setShowTicket(v=>!v)}>{showTicket?"Hide ticket":"Open testnet ticket"}</button></div>
        <p style={muted}>Uses TarotAI’s authenticated Binance USDⓈ-M demo/testnet endpoint only. No live-money order is submitted by this component.</p>
        {showTicket?<div style={{display:"grid",gap:8}}>
          <label style={muted}>Side<select style={input} value={side} onChange={e=>setSide(e.target.value as "BUY"|"SELL")}><option value="BUY">BUY / LONG</option><option value="SELL">SELL / SHORT</option></select></label>
          <label style={muted}>Quantity<input style={input} type="number" min="0.000001" step="0.001" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
          <label style={muted}>Limit price (USDT)<input style={input} type="number" min="0.000001" step="0.1" value={limitPrice|| (Number.isFinite(price)?String(price):"")} onChange={e=>setLimitPrice(e.target.value)}/></label>
          <label style={{...muted,color:"#e9cb71",display:"flex",alignItems:"flex-start",gap:7}}><input type="checkbox" checked={confirmedDemo} onChange={e=>setConfirmedDemo(e.target.checked)}/><span>I confirm this is a demo/testnet order only, not a real-money order.</span></label>
          <button style={{...button,background:"#173b31",borderColor:"#28654f"}} disabled={orderBusy||stale} onClick={submitTestnet}>{orderBusy?"Submitting…":"Submit testnet limit order"}</button>
          {orderStatus?<div role="status" aria-live="polite" style={{...muted,color:orderError?"#ff8899":"#79e8b7",overflowWrap:"anywhere"}}>{orderStatus}</div>:null}
        </div>:null}
      </article>
    </div>
    <footer style={{...muted,padding:"9px 12px",borderTop:"1px solid #1f2d3d"}}>Public aggregated trades are not complete order-book depth, liquidation prints, or guaranteed liquidity. Rendering is coalesced with requestAnimationFrame and canvas pixel ratio is capped at 2 on mobile.</footer>
  </section>;
}
