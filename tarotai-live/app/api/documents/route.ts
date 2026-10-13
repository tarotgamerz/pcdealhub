import { extractOfficeText, extractPdfText } from "../../../lib/document-extract.mjs";
import { isAuthorized } from "../../../lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_TEXT = 120_000;

function cleanText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function textMime(mime: string, name: string) {
  const lower = name.toLowerCase();
  return (
    mime.startsWith("text/") ||
    ["md", "markdown", "txt", "csv", "json", "xml", "html", "log"].some((ext) =>
      lower.endsWith("." + ext)
    )
  );
}

function officeMime(mime: string, name: string) {
  const lower = name.toLowerCase();
  return (
    mime === "application/pdf" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    ["pdf", "docx", "pptx", "xlsx"].some((ext) => lower.endsWith("." + ext))
  );
}

export async function POST(request: Request) {
  try {
    if (!process.env.TAROTAI_ACCESS_CODE) {
      return Response.json(
        { error: "Private access is not configured. Set TAROTAI_ACCESS_CODE in the Vercel Production environment and redeploy." },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (!isAuthorized(request)) {
      return Response.json(
        { error: "Authentication required." },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const form = await request.formData();
    const item = form.get("file");
    if (!(item instanceof File)) {
      return Response.json(
        { error: "Attach a file using the 'file' field." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (item.size > MAX_BYTES) {
      return Response.json(
        { error: "Document is too large. Maximum upload size is 4 MB." },
        { status: 413, headers: { "Cache-Control": "no-store" } }
      );
    }

    const name = String(item.name || "document").slice(0, 180);
    const mime = String(item.type || "application/octet-stream");
    const buffer = Buffer.from(await item.arrayBuffer());

    let text = "";
    let extractionMode = "plain-text";

    if (textMime(mime, name)) {
      text = buffer.toString("utf8");
    } else if (officeMime(mime, name)) {
      const isPdf = mime === "application/pdf" || name.toLowerCase().endsWith(".pdf");
      text = isPdf
        ? await extractPdfText(buffer)
        : await extractOfficeText(buffer);
      extractionMode = isPdf ? "pdf-parse-node-worker" : "office-text-extractor";
    } else {
      return Response.json(
        {
          error:
            "Unsupported document type. Supported: PDF, DOCX, PPTX, XLSX, TXT, MD, CSV, JSON, XML, HTML and LOG."
        },
        { status: 415, headers: { "Cache-Control": "no-store" } }
      );
    }

    text = cleanText(String(text));
    const truncated = text.length > MAX_TEXT;
    const excerpt = text.slice(0, MAX_TEXT);

    return Response.json(
      {
        ok: true,
        name,
        mime,
        bytes: item.size,
        extractionMode,
        characters: text.length,
        truncated,
        text: excerpt,
        warning:
          !excerpt
            ? "No text was extracted. This may be a scanned/image-only document and needs OCR."
            : truncated
              ? "The document is larger than the context limit; only the first 120,000 characters were extracted."
              : null
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("tarotai document extraction error", error);
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: "Document extraction failed: " + message },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
