import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { isAuthorized } from "../../../lib/auth";
export const runtime="nodejs";
const COOKIE="tarotai_session";
const secret=()=>process.env.TAROTAI_ACCESS_CODE||"";
const sign=(payload:string)=>secret()?createHmac("sha256",secret()).update(payload).digest("hex"):"";
export async function GET(req:Request){return NextResponse.json({authenticated:isAuthorized(req),accessCodeConfigured:Boolean(secret())});}
export async function POST(req:Request){
 let body:any={};try{body=await req.json()}catch{}
 const expected=secret();if(!expected)return NextResponse.json({error:"Private access is not configured. Set TAROTAI_ACCESS_CODE and redeploy."},{status:503});
 const supplied=typeof body?.code==="string"?body.code:"",a=Buffer.from(supplied),b=Buffer.from(expected);
 if(a.length!==b.length||!timingSafeEqual(a,b))return NextResponse.json({error:"Access denied"},{status:401});
 const payload=Buffer.from(JSON.stringify({exp:Date.now()+8*60*60*1000,nonce:randomUUID()})).toString("base64url");
 const response=NextResponse.json({authenticated:true,expiresInSeconds:28800});
 response.cookies.set(COOKIE,payload+"."+sign(payload),{httpOnly:true,secure:true,sameSite:"strict",path:"/",maxAge:28800});
 return response;
}
export async function DELETE(){const response=NextResponse.json({authenticated:false});response.cookies.set(COOKIE,"",{httpOnly:true,secure:true,sameSite:"strict",path:"/",maxAge:0});return response;}
