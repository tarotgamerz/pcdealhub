import { NextResponse } from "next/server";
import { isAuthorized } from "./auth";

const PRIVATE_HEADERS = {
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
};

export function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

export function ownerGuard(request: Request): NextResponse | null {
  if (!process.env.TAROTAI_ACCESS_CODE) {
    return privateJson({ error: "Private access is not configured." }, 503);
  }
  if (!isAuthorized(request)) {
    return privateJson({ error: "Authentication required." }, 401);
  }
  return null;
}

export class RequestInputError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "RequestInputError";
  }
}

export async function readJsonLimited(request: Request, maxBytes: number): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestInputError("Request body is too large.", 413);
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    throw new RequestInputError("Could not read request body.", 400);
  }

  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    throw new RequestInputError("Request body is too large.", 413);
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new RequestInputError("Expected valid JSON.", 400);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseModelJson(text: string): Record<string, unknown> {
  const fenced = text.match(/^\x60{3}(?:json)?\s*([\s\S]*?)\x60{3}$/i);
  const candidate = (fenced ? fenced[1] : text).trim();

  try {
    const parsed: unknown = JSON.parse(candidate);
    if (isRecord(parsed)) return parsed;
  } catch {
    // The model may add a short preamble. Extract one balanced JSON object.
  }

  const start = candidate.indexOf("{");
  if (start < 0) throw new Error("Model returned no JSON object.");

  let depth = 0;
  let quoted = false;
  let escaped = false;

  for (let i = start; i < candidate.length; i++) {
    const char = candidate[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) {
        const parsed: unknown = JSON.parse(candidate.slice(start, i + 1));
        if (isRecord(parsed)) return parsed;
        break;
      }
    }
  }

  throw new Error("Model returned incomplete or invalid JSON.");
}

export function sanitizeDiagnosticText(value: string): string {
  return value
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED_KEY]")
    .replace(/xai-[0-9A-Za-z_-]{12,}/gi, "[REDACTED_KEY]")
    .replace(/sk-or-v1-[0-9A-Za-z_-]+/g, "[REDACTED_KEY]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(
      /\b(api[_ -]?key|access[_ -]?code|token|secret|password)\b(\s*[:=]\s*)[^\s,;]+/gi,
      "$1$2[REDACTED]",
    )
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[URL]")
    .slice(0, 260);
}
