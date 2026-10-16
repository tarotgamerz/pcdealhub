import { NextResponse } from "next/server";
import { isAuthorized } from "../../../../lib/auth";
export const runtime="nodejs";
export async function POST(req:Request){
 if(!process.env.TAROTAI_ACCESS_CODE)return NextResponse.json({error:"Private access is not configured"},{status:503});
 if(!isAuthorized(req))return NextResponse.json({error:"Authentication required"},{status:401});
 let b:any;try{b=await req.json()}catch{return NextResponse.json({error:"Expected JSON"},{status:400})}
 const entry=Number(b.entry),stop=Number(b.stop),target=Number(b.target),riskPct=Number(b.riskPct??0.5),balance=Number(b.paperBalance??10000),age=Number(b.dataAgeMs??0),spread=Number(b.spreadBps),side=String(b.side||"LONG").toUpperCase();
 const issues:string[]=[];
 if(![entry,stop,target,riskPct,balance,age,spread].every(Number.isFinite))issues.push("Numeric values must be finite");
 if(entry<=0||stop<=0||target<=0)issues.push("Entry, stop and target must be positive");
 if(!["LONG","SHORT"].includes(side))issues.push("Side must be LONG or SHORT");
 if(side==="LONG"&&!(stop<entry&&target>entry))issues.push("Long geometry requires stop < entry < target");
 if(side==="SHORT"&&!(target<entry&&entry<stop))issues.push("Short geometry requires target < entry < stop");
 if(riskPct<0.1||riskPct>1)issues.push("Risk must be between 0.1% and 1% of paper balance");
 if(balance<100||balance>10000000)issues.push("Paper balance must be between 100 and 10,000,000 USDT");
 if(!Number.isFinite(spread))issues.push("Live bid-ask spread is unavailable; paper entry is blocked");
 if(age<0||age>60000)issues.push("Market data is stale or invalid");
 if(spread<0||spread>20)issues.push("Spread is invalid or above 20 bps");
 const risk=Math.abs(entry-stop),reward=Math.abs(target-entry),rr=risk>0?reward/risk:0;
 if(rr<1.5)issues.push("Reward/risk is below 1.5:1");
 const accepted=issues.length===0;
 return NextResponse.json({mode:"PAPER_ONLY",strategyAgent:{agent:"StrategyReview",verdict:accepted?"CONDITIONALLY_ACCEPT":"REJECT",checks:["trade geometry","reward/risk","data freshness"],issues},riskAgent:{agent:"IndependentRisk",verdict:accepted?"PAPER_ONLY_APPROVAL":"VETO",riskBudget:Number((balance*riskPct/100).toFixed(2)),maximumPositionNotional:Number((balance*0.25).toFixed(2)),maximumPortfolioNotional:Number(balance.toFixed(2)),maximumOpenPlannedRisk:Number((balance*0.03).toFixed(2)),stopDistancePct:entry>0?Number((risk/entry*100).toFixed(4)):null,hardLimits:["no live orders","stale data veto","maximum 1% balance risk per position","maximum 25% notional per position","maximum 100% total open notional at 1x","maximum 3% combined planned stop-risk"],issues},combinedVerdict:accepted?"PAPER_ONLY_APPROVAL":"REJECT",riskReward:Number(rr.toFixed(3)),liveTradingEnabled:false,disclaimer:"Deterministic guardrails only; these are not independent LLM opinions or proof of strategy edge."});
}