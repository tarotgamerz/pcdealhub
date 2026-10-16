const INTERVAL_MS=Object.freeze({"1m":60000,"3m":180000,"5m":300000,"15m":900000,"30m":1800000,"1h":3600000,"2h":7200000,"4h":14400000,"1d":86400000});
const REQUIRED=["BIAS","VETO","EVIDENCE","HISTORICAL","TRIGGER","INVALIDATION","COUNTERARGUMENT"];
const ROLES=["market","entry","exits","sizing","discipline","position","journal"],DIRECTIONAL=["market","entry","exits","sizing","discipline"];
function mean(v){return v.length?v.reduce((a,b)=>a+b,0)/v.length:NaN;}
function ema(v,p){const o=Array(v.length).fill(NaN);if(!v.length)return o;const k=2/(p+1);o[0]=v[0];for(let i=1;i<v.length;i++)o[i]=v[i]*k+o[i-1]*(1-k);return o;}
function rsi(v,p=14){const o=Array(v.length).fill(NaN);if(v.length<=p)return o;let g=0,l=0;for(let i=1;i<=p;i++){const d=v[i]-v[i-1];g+=Math.max(d,0);l+=Math.max(-d,0);}g/=p;l/=p;o[p]=l===0?(g===0?50:100):100-100/(1+g/l);for(let i=p+1;i<v.length;i++){const d=v[i]-v[i-1];g=(g*(p-1)+Math.max(d,0))/p;l=(l*(p-1)+Math.max(-d,0))/p;o[i]=l===0?(g===0?50:100):100-100/(1+g/l);}return o;}
function atr(c,p=14){const tr=c.map((x,i)=>i===0?x.high-x.low:Math.max(x.high-x.low,Math.abs(x.high-c[i-1].close),Math.abs(x.low-c[i-1].close)));const o=Array(tr.length).fill(NaN);if(tr.length<p)return o;let n=mean(tr.slice(0,p));o[p-1]=n;for(let i=p;i<tr.length;i++){n=(n*(p-1)+tr[i])/p;o[i]=n;}return o;}
function round(n,d=4){return Number.isFinite(n)?Number(n.toFixed(d)):null;}
/** Rule confluence points only; not a calibrated win-probability estimate. */
export function computeTechnicalScorecard(options={}) {
 const c=Array.isArray(options.candles)?options.candles:[],interval=String(options.interval||""),higher=String(options.higherTrend||"UNAVAILABLE").toUpperCase(),h=options.historicalStudy||{},age=Number(options.lastClosedCandleAgeMs),duration=INTERVAL_MS[interval];
 const noData=reason=>({available:false,version:"setup-evidence-v1",label:"Setup evidence score (not win probability)",isProbability:false,status:"WAIT",reason,long:{score:0,maxScore:100,checks:[]},short:{score:0,maxScore:100,checks:[]},diagnostics:{}});
 if(!duration)return noData("Unsupported timeframe; scores withheld.");if(c.length<80)return noData("Need at least 80 closed candles; scores withheld.");
 let previous=-Infinity;for(const x of c){if(!x||![x.time,x.open,x.high,x.low,x.close].every(Number.isFinite)||x.time<=previous||x.time<=0||x.open<=0||x.close<=0||x.low<=0||x.high<Math.max(x.open,x.close,x.low)||x.low>Math.min(x.open,x.close,x.high))return noData("Invalid or unordered candle data; scores withheld.");previous=x.time;}
 const closes=c.map(x=>x.close),i=c.length-1,last=c[i],prev=c[i-1],e9=ema(closes,9),e21=ema(closes,21),e50=ema(closes,50),rv=rsi(closes),av=atr(c),prior=c.slice(i-20,i),hi=Math.max(...prior.map(x=>x.high)),lo=Math.min(...prior.map(x=>x.low)),fresh=Number.isFinite(age)&&age>=0&&age<=duration*2+60000;
 const up=e9[i]>e9[Math.max(0,i-3)],down=e9[i]<e9[Math.max(0,i-3)];
 const histLong=h.ready===true&&Number(h.sampleCount)>=5&&h.sideBias==="LONG"&&Number(h.positiveSharePct)>=60&&Number(h.averageReturnPct)>0;
 const histShort=h.ready===true&&Number(h.sampleCount)>=5&&h.sideBias==="SHORT"&&Number(h.negativeSharePct)>=60&&Number(h.averageReturnPct)<0;
 const longChecks=[
 {key:"trend",label:"Main timeframe trend",points:25,passed:last.close>e50[i]&&e9[i]>e21[i],detail:"Close above EMA50; EMA9 above EMA21."},
 {key:"momentum",label:"Momentum",points:15,passed:up&&last.close>prev.close&&rv[i]>=52&&rv[i]<=72,detail:"EMA9 rising; close advancing; RSI14 from 52 to 72."},
 {key:"breakout",label:"Closed-candle breakout",points:20,passed:last.close>hi,detail:"Close above prior 20-candle high."},
 {key:"higherTimeframe",label:"Higher-timeframe alignment",points:20,passed:higher==="BULLISH",detail:"Higher timeframe bullish."},
 {key:"historical",label:"Historical analogue support",points:10,passed:histLong,detail:"At least five matched cases support LONG with positive observed outcomes."},
 {key:"freshness",label:"Data freshness",points:10,passed:fresh,detail:"Closed candle is inside freshness window."}];
 const shortChecks=[
 {key:"trend",label:"Main timeframe trend",points:25,passed:last.close<e50[i]&&e9[i]<e21[i],detail:"Close below EMA50; EMA9 below EMA21."},
 {key:"momentum",label:"Momentum",points:15,passed:down&&last.close<prev.close&&rv[i]>=28&&rv[i]<=48,detail:"EMA9 falling; close declining; RSI14 from 28 to 48."},
 {key:"breakdown",label:"Closed-candle breakdown",points:20,passed:last.close<lo,detail:"Close below prior 20-candle low."},
 {key:"higherTimeframe",label:"Higher-timeframe alignment",points:20,passed:higher==="BEARISH",detail:"Higher timeframe bearish."},
 {key:"historical",label:"Historical analogue support",points:10,passed:histShort,detail:"At least five matched cases support SHORT with negative observed outcomes."},
 {key:"freshness",label:"Data freshness",points:10,passed:fresh,detail:"Closed candle is inside freshness window."}];
 const side=checks=>({score:checks.reduce((n,x)=>n+(x.passed?x.points:0),0),maxScore:100,checks}),long=side(longChecks),short=side(shortChecks),spread=Math.abs(e9[i]-e21[i])/last.close;
 const regime=spread>.0015&&last.close>e50[i]&&e9[i]>e21[i]?"TRENDING_UP":spread>.0015&&last.close<e50[i]&&e9[i]<e21[i]?"TRENDING_DOWN":"RANGE_OR_TRANSITION";
 return {available:true,version:"setup-evidence-v1",label:"Setup evidence score (not win probability)",isProbability:false,status:fresh?"READY_FOR_REVIEW":"WAIT",reason:fresh?"Points measure rule confluence only; risk, historical and exact-candle gates remain mandatory.":"Stale/unknown candle age; do not use for entry.",evidenceLeader:long.score>=short.score+15?"LONG":short.score>=long.score+15?"SHORT":"MIXED",long,short,diagnostics:{symbolTimeframe:interval,lastClosedCandleTime:new Date(last.time).toISOString(),lastClosedCandleAgeMs:Number.isFinite(age)?Math.max(0,Math.round(age)):null,freshnessLimitMs:duration*2+60000,higherTimeframeTrend:higher,marketRegime:regime,close:round(last.close,8),ema9:round(e9[i],8),ema21:round(e21[i],8),ema50:round(e50[i],8),rsi14:round(rv[i],2),atr14:round(av[i],8),atrPercent:round(av[i]/last.close*100,4),prior20BarHigh:round(hi,8),prior20BarLow:round(lo,8),historicalSampleCount:Number(h.sampleCount)||0,historicalSideBias:String(h.sideBias||"NEUTRAL")}};
}
export function parseSpecialistReport(text) {
 const source=typeof text==="string"?text:"",fields={},missing=[];
 for(const field of REQUIRED){const re=new RegExp("^\\s*(?:[-*]\\s*)?(?:\\*\\*)?"+field+"(?:\\*\\*)?\\s*:\\s*(.*?)\\s*$","im");const m=source.match(re),v=m?.[1]?.replace(/\*\*/g,"").trim()||"";if(!v)missing.push(field);fields[field]=v;}
 const bias=fields.BIAS.toUpperCase().match(/^(LONG|SHORT|WAIT)\b/)?.[1]||"WAIT",vetoVal=fields.VETO.toUpperCase().match(/^(YES|NO)\b/)?.[1]||"";
 if(fields.BIAS&&!["LONG","SHORT","WAIT"].includes(bias))missing.push("valid BIAS");if(fields.VETO&&!vetoVal)missing.push("valid VETO");
 return {fields,bias,veto:vetoVal==="YES",biasDeclared:Boolean(fields.BIAS)&&["LONG","SHORT","WAIT"].includes(bias),vetoDeclared:Boolean(vetoVal),complete:missing.length===0,missing};
}
export function auditSpecialistResults(results,market={},history={}) {
 const issues=[],byRole=new Map();for(const r of Array.isArray(results)?results:[]){if(!r||typeof r.role!=="string")continue;if(byRole.has(r.role))issues.push("Duplicate report for "+r.role+".");else byRole.set(r.role,r);}
 for(const role of ROLES){const r=byRole.get(role);if(!r){issues.push("Missing specialist report: "+role+".");continue;}if(r.ok===false)issues.push(role+" failed.");if(r.fallback||r.providerStatus==="degraded")issues.push(role+" used fallback/degraded output.");const p=parseSpecialistReport(r.text);if(!p.complete)issues.push(role+" report is incomplete ("+p.missing.join(", ")+").");if(r.veto===true||p.veto)issues.push(role+" raised a veto.");}
 const votes=DIRECTIONAL.map(role=>({role,r:byRole.get(role)})).filter(x=>x.r&&x.r.ok!==false&&["LONG","SHORT"].includes(String(x.r.bias).toUpperCase())),longs=votes.filter(x=>String(x.r.bias).toUpperCase()==="LONG"),shorts=votes.filter(x=>String(x.r.bias).toUpperCase()==="SHORT");
 if(longs.length>=2&&shorts.length>=2)issues.push("Material directional conflict: "+longs.length+" LONG versus "+shorts.length+" SHORT among core roles.");
 const samples=Math.max(0,Number(history.sampleCount)||0),historyBias=String(history.sideBias||"NEUTRAL").toUpperCase(),at=String(market.lastClosedCandleTime||"unavailable"),veto=issues.length>0;
 const text=["BIAS: WAIT","VETO: "+(veto?"YES":"NO"),"EVIDENCE: Rule supervisor checked "+byRole.size+" reports on closed candle "+at+"; core votes "+longs.length+" LONG / "+shorts.length+" SHORT.","HISTORICAL: "+samples+" matched prior cases; observed side bias "+historyBias+"; descriptive, not calibrated probability.","TRIGGER: Require at least four of five core roles to agree, no veto, aligned historical support and exact-candle chart confirmation.","INVALIDATION: Missing/incomplete report, degraded provider, declared veto, material direction conflict, stale data or candle mismatch means WAIT.","COUNTERARGUMENT: Structural checks cannot prove semantic truth or profitability; a clean audit is not an entry signal."].join("\n");
 return {veto,issues,longs:longs.length,shorts:shorts.length,text,model:"rules-supervisor-v1"};
}
