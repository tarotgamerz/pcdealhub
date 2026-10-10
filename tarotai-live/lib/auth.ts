import { createHmac, timingSafeEqual } from "node:crypto";
const COOKIE = "tarotai_session";
const secret = () => process.env.TAROTAI_ACCESS_CODE || "";
const sign = (payload:string) => secret() ? createHmac("sha256",secret()).update(payload).digest("hex") : "";
export function isAuthorized(request:Request) {
 const raw=request.headers.get("cookie")||"";
 const token=raw.split(";").map(v=>v.trim()).find(v=>v.startsWith(COOKIE+"="))?.slice(COOKIE.length+1)||"";
 try {
  const decoded=decodeURIComponent(token),parts=decoded.split("."),payload=parts[0],signature=parts[1];
  if(!payload||!signature||!secret())return false;
  const a=Buffer.from(signature),b=Buffer.from(sign(payload));
  if(a.length!==b.length||!timingSafeEqual(a,b))return false;
  const data=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
  return data.exp>Date.now()&&typeof data.nonce==="string";
 } catch { return false; }
}
