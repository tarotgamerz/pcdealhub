import { Redis } from "@upstash/redis";

export const redis = memoryEnabled() ? Redis.fromEnv() : null;

export function memoryEnabled() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

export function memoryKey(userId: string) {
  return "tarotai:memory:" + userId;
}

export function stateKey(userId: string) {
  return "tarotai:state:" + userId;
}

export function auditKey(userId: string) {
  return "tarotai:audit:" + userId;
}

export function rateKey(userId: string, bucket: string) {
  return "tarotai:rate:" + userId + ":" + bucket;
}

export function privateUserId(request: Request) {
  const raw = request.headers.get("cookie") || "";
  const item = raw
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("tarotai_user="));
  return item ? decodeURIComponent(item.slice("tarotai_user=".length)) : null;
}

export function authorized(request: Request) {
  const configured = Boolean(process.env.TAROTAI_ACCESS_CODE);
  const raw = request.headers.get("cookie") || "";
  const session = raw
    .split(";")
    .map((part) => part.trim())
    .some((part) => part === "tarotai_session=authorized");
  return !configured || session;
}

export function forbiddenMemoryKey(key: string) {
  return /(password|passcode|access.?code|api.?key|token|secret|credential|private.?key|bank|card|cvv|otp)/i.test(key);
}

export async function consumeRateLimit(userId: string, limit = 30) {
  if (!memoryEnabled()) return { allowed: true, remaining: limit };
  const bucket = Math.floor(Date.now() / 60000).toString();
  const key = rateKey(userId, bucket);
  const count = await redis!.incr(key);
  if (count === 1) await redis!.expire(key, 90);
  return { allowed: count <= limit, remaining: Math.max(0, limit - count), count };
}

export async function appendAudit(userId: string, event: Record<string, unknown>) {
  if (!memoryEnabled()) return;
  await redis!.lpush(auditKey(userId), JSON.stringify({
    at: new Date().toISOString(),
    ...event
  }));
  await redis!.ltrim(auditKey(userId), 0, 199);
}
