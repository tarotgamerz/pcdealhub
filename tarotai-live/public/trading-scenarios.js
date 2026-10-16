(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.TarotAITradingScenarios=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const INTERVAL_MS={"1m":60000,"3m":180000,"5m":300000,"15m":900000,"30m":1800000,"1h":3600000,"2h":7200000,"4h":14400000,"1d":86400000};
  const finite=n=>Number.isFinite(Number(n));
  function ema(values,period){if(!values.length)return[];const k=2/(period+1),out=[values[0]];for(let i=1;i<values.length;i++)out.push(values[i]*k+out[i-1]*(1-k));return out;}
  function rsi(values,period=14){const out=Array(values.length).fill(NaN);if(values.length<=period)return out;let gain=0,loss=0;for(let i=1;i<=period;i++){const d=values[i]-values[i-1];gain+=Math.max(d,0);loss+=Math.max(-d,0);}gain/=period;loss/=period;out[period]=loss===0?(gain===0?50:100):100-100/(1+gain/loss);for(let i=period+1;i<values.length;i++){const d=values[i]-values[i-1];gain=(gain*(period-1)+Math.max(d,0))/period;loss=(loss*(period-1)+Math.max(-d,0))/period;out[i]=loss===0?(gain===0?50:100):100-100/(1+gain/loss);}return out;}
  function atr(candles,period=14){const tr=candles.map((c,i)=>i===0?c.high-c.low:Math.max(c.high-c.low,Math.abs(c.high-candles[i-1].close),Math.abs(c.low-candles[i-1].close)));const out=Array(tr.length).fill(NaN);if(tr.length<period)return out;let value=tr.slice(0,period).reduce((a,b)=>a+b,0)/period;out[period-1]=value;for(let i=period;i<tr.length;i++){value=(value*(period-1)+tr[i])/period;out[i]=value;}return out;}
  function isValidCandle(c){return !!c&&[c.time,c.open,c.high,c.low,c.close].every(finite)&&Number(c.time)>0&&Number(c.open)>0&&Number(c.close)>0&&Number(c.low)>0&&Number(c.high)>=Math.max(Number(c.open),Number(c.close),Number(c.low))&&Number(c.low)<=Math.min(Number(c.open),Number(c.close),Number(c.high));}
  function closedHigherAt(higher,time,intervalMs){return (Array.isArray(higher)?higher:[]).filter(c=>{if(!isValidCandle(c)||Number(c.time)>time)return false;const end=finite(c.closeTime)&&Number(c.closeTime)>Number(c.time)?Number(c.closeTime):Number(c.time)+intervalMs-1;return end<=time;}).slice(-180);}
  function invalid(reason){return {status:"WAIT",reason,direction:"WAIT",bias:"WAIT",entry:null,atr:null,longScore:0,shortScore:0,scoreMax:6,horizonBars:6,scenarios:[],createdAt:null};}
  function trendDirection(higher,intervalMs){if(higher.length<55)return {ready:false,direction:"UNAVAILABLE",up:false,down:false};const cls=higher.map(c=>Number(c.close)),e20=ema(cls,20),e50=ema(cls,50),i=cls.length-1,up=cls[i]>e50[i]&&e20[i]>e50[i],down=cls[i]<e50[i]&&e20[i]<e50[i];return {ready:true,direction:up?"BULLISH":down?"BEARISH":"MIXED / NEUTRAL",up,down};}
  function makePath(startTime,entry,target,intervalMs,horizonBars){const stepSeconds=Math.max(1,Math.floor(intervalMs/1000));const path=[{time:Math.floor(startTime/1000),value:entry}];for(let step=1;step<=horizonBars;step++)path.push({time:Math.floor(startTime/1000)+step*stepSeconds,value:entry+(target-entry)*step/horizonBars});return path;}
  function scoreAt(candles,higherCandles,options={}){
    const intervalMs=Number(options.intervalMs)||300000,horizonBars=Math.max(2,Math.min(24,Math.floor(Number(options.horizonBars)||6)));
    if(!Array.isArray(candles)||candles.length<80)return invalid("Need at least 80 valid closed candles before a forecast can be built.");
    if(!candles.every(isValidCandle)||candles.some((c,i)=>i>0&&Number(c.time)<=Number(candles[i-1].time)))return invalid("Candle data is invalid or not strictly chronological; forecast withheld.");
    if(options.marketFresh===false)return invalid("The market snapshot is stale or reference-only; directional forecast withheld until valid fresh data returns.");
    const closes=candles.map(c=>Number(c.close)),i=closes.length-1,last=candles[i],previous=candles[i-1];
    const e9=ema(closes,9),e21=ema(closes,21),e50=ema(closes,50),momentum=rsi(closes,14),volatility=atr(candles,14),a=volatility[i];
    if(![e9[i],e21[i],e50[i],momentum[i],a].every(Number.isFinite)||a<=0)return invalid("EMA, RSI or ATR is unavailable; forecast withheld.");
    const prior=candles.slice(Math.max(0,i-20),i);if(prior.length<20)return invalid("Need 20 previous completed candles for support/resistance context.");
    const priorHigh=Math.max(...prior.map(c=>Number(c.high))),priorLow=Math.min(...prior.map(c=>Number(c.low)));
    const higher=closedHigherAt(higherCandles,Number(last.time),intervalMs),htf=trendDirection(higher,intervalMs);
    const upBreak=Number(last.close)>priorHigh,downBreak=Number(last.close)<priorLow;
    const rising=e9[i]>e9[Math.max(0,i-3)]&&Number(last.close)>Number(previous.close),falling=e9[i]<e9[Math.max(0,i-3)]&&Number(last.close)<Number(previous.close);
    const longChecks=[e9[i]>e21[i],Number(last.close)>e50[i],rising,momentum[i]>=52&&momentum[i]<=74,upBreak,htf.up];
    const shortChecks=[e9[i]<e21[i],Number(last.close)<e50[i],falling,momentum[i]>=26&&momentum[i]<=48,downBreak,htf.down];
    const longScore=longChecks.filter(Boolean).length,shortScore=shortChecks.filter(Boolean).length;
    let direction="WAIT",label="NO EDGE · WAIT";
    if(htf.up&&longScore>=4&&longScore-shortScore>=2){direction="LONG";label="BULLISH CONTINUATION";}
    else if(htf.down&&shortScore>=4&&shortScore-longScore>=2){direction="SHORT";label="BEARISH CONTINUATION";}
    const entry=Number(last.close),rangeMid=(priorHigh+priorLow)/2,intervalLabel=Object.keys(INTERVAL_MS).find(k=>INTERVAL_MS[k]===intervalMs)||"selected timeframe";
    const support=finite(options.support)&&Number(options.support)<entry?Number(options.support):priorLow;
    const resistance=finite(options.resistance)&&Number(options.resistance)>entry?Number(options.resistance):priorHigh;
    const longStructural=Number.isFinite(resistance)&&resistance-entry>=a*.5&&resistance-entry<=a*2.5;
    const shortStructural=Number.isFinite(support)&&entry-support>=a*.5&&entry-support<=a*2.5;
    const longTarget=longStructural?resistance:entry+a*1.5,shortTarget=shortStructural?support:entry-a*1.5;
    const longInvalidation=support<entry?support:entry-a,shortInvalidation=resistance>entry?resistance:entry+a;
    const base=direction==="LONG"?{key:"base",title:label,side:"LONG",entry,target:longTarget,trigger:upBreak?entry:priorHigh,invalidation:longInvalidation,score:longScore,summary:"Continuation only while price holds above invalidation and the higher timeframe stays bullish."}
      :direction==="SHORT"?{key:"base",title:label,side:"SHORT",entry,target:shortTarget,trigger:downBreak?entry:priorLow,invalidation:shortInvalidation,score:shortScore,summary:"Continuation only while price stays below invalidation and the higher timeframe stays bearish."}
      :{key:"base",title:label,side:"WAIT",entry,target:entry,trigger:null,invalidation:null,score:Math.max(longScore,shortScore),summary:"Directional evidence does not align strongly enough. Keep both conditional alternatives visible; no base-case trade direction is asserted."};
    const bullish={key:"bullish",title:"BULLISH BREAKOUT",side:"LONG",entry,target:Math.max(entry,priorHigh)+a*1.25,trigger:priorHigh,invalidation:longInvalidation,score:longScore,summary:"Activate only after a completed candle confirms acceptance above the prior 20-candle high."};
    const bearish={key:"bearish",title:"BEARISH BREAKDOWN",side:"SHORT",entry,target:Math.min(entry,priorLow)-a*1.25,trigger:priorLow,invalidation:shortInvalidation,score:shortScore,summary:"Activate only after a completed candle confirms acceptance below the prior 20-candle low."};
    const scenarios=[base,bullish,bearish].map(s=>({...s,target:Number.isFinite(s.target)?s.target:null,delta:Number.isFinite(s.target)?s.target-entry:null,deltaPct:Number.isFinite(s.target)&&entry>0?(s.target/entry-1)*100:null,horizonBars,horizonLabel:horizonBars+" "+intervalLabel+" candles",path:s.side==="WAIT"?[]:makePath(Number(last.time),entry,s.target,intervalMs,horizonBars)}));
    return {status:"READY",reason:"Conditional OHLCV scenarios; not a calibrated probability and not a trade instruction.",direction,bias:direction,label,entry,atr:a,rsi:momentum[i],priorHigh,priorLow,support,resistance,longScore,shortScore,scoreMax:6,higherTrend:htf.direction,higherTrendReady:htf.ready,horizonBars,horizonLabel:horizonBars+" "+intervalLabel+" candles",candleTime:Number(last.time),createdAt:new Date().toISOString(),scenarios};
  }
  function buildForecast(candles,higherCandles,options={}){return scoreAt(candles,higherCandles,options);}
  function evaluateWalkForward(candles,higherCandles,intervalMs,horizonBars=6){
    const duration=Number(intervalMs)||300000,horizon=Math.max(2,Math.min(24,Math.floor(Number(horizonBars)||6))),bars=Array.isArray(candles)?candles.slice(-1000):[];
    const result={method:"rolling walk-forward; closed candles only",horizonBars:horizon,sampleSize:0,correct:0,directionalHitRatePct:null,averageDirectionalReturnPct:null,meetsMinimumSample:false,notice:"Historical directional scoring on loaded candles, no fees/slippage and not a guarantee of future results."};
    if(bars.length<100||!Array.isArray(higherCandles)||higherCandles.length<55)return result;
    const returns=[];
    for(let i=80;i+horizon<bars.length;i+=horizon){
      const current=bars[i];if(!isValidCandle(current))continue;
      const prefix=bars.slice(0,i+1),higher=closedHigherAt(higherCandles,Number(current.time),duration);
      const prediction=scoreAt(prefix,higher,{intervalMs:duration,horizonBars:horizon,marketFresh:true});
      if(!["LONG","SHORT"].includes(prediction.direction))continue;
      const future=bars[i+horizon];if(!isValidCandle(future)||Number(future.time)<=Number(current.time))continue;
      const signedReturn=(Number(future.close)/Number(current.close)-1)*100*(prediction.direction==="LONG"?1:-1);
      if(!Number.isFinite(signedReturn))continue;
      returns.push({correct:signedReturn>0,returnPct:signedReturn});
    }
    result.sampleSize=returns.length;result.correct=returns.filter(x=>x.correct).length;
    result.directionalHitRatePct=returns.length?result.correct/returns.length*100:null;
    result.averageDirectionalReturnPct=returns.length?returns.reduce((n,x)=>n+x.returnPct,0)/returns.length:null;
    result.meetsMinimumSample=returns.length>=20;
    return result;
  }
  return {buildForecast,evaluateWalkForward,ema,rsi,atr};
});
