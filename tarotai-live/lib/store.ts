import { Redis } from "@upstash/redis";

export const redis = Redis.fromEnv();

export function memoryKey(userId: string) {
  return "tarotai:memory:" + userId;
}

export function stateKey(userId: string) {
  return "tarotai:state:" + userId;
}

export function memoryEnabled() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  );
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
