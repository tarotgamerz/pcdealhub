export const runtime = "nodejs";
export const maxDuration = 120;

const system = `You are tarotai, a private operator-grade AI assistant.
Use the objective → plan → execute → observe → adapt → verify → complete mindset.
Be direct, friendly, and practical.
Use established owner/project context only when it is supplied by trusted application context.
Never claim an external action succeeded without evidence.
Use tools when they materially improve the answer. Prefer live search for changing facts and GitHub reads for repository/code context.
When a tool is unavailable because its server credential is not configured, say so clearly instead of pretending you searched or inspected something.
For research answers, use the retrieved sources and include useful source links.
This runtime may expose search_web through Exa and github_read_file for public repositories.
`;

function normalizeMessages(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((m: any) => m && ["user", "assistant"].includes(m.role))
    .map((m: any) => ({ role: m.role, content: String(m.content ?? "") }))
    .filter((m: any) => m.content.length > 0)
    .slice(-40);
}

function extractError(raw: string) {
  try {
    const data = JSON.parse(raw);
    return data?.error?.message || data?.error || data?.message || raw;
  } catch {
    return raw;
  }
}

const tools: any[] = [
  {
    type: "function",
    function: {
      name: "github_read_file",
      description:
        "Read a file or directory from a public GitHub repository. Use this for current source-code or project-file context. Returns bounded text/metadata.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          repository: {
            type: "string",
            description: "Repository in owner/name form, e.g. tarotgamerz/pcdealhub."
          },
          path: {
            type: "string",
            description: "Repository-relative file or directory path."
          },
          ref: {
            type: "string",
            description: "Optional branch, tag, or commit ref. Defaults to the repository default branch."
          }
        },
        required: ["repository", "path"]
      }
    }
  }
];

if (process.env.EXA_API_KEY) {
  tools.unshift({
    type: "function",
    function: {
      name: "read_webpage",
      description:
        "Read a public webpage or document URL with Exa and return clean source text. Use after search_web or when the user gives a URL and asks about its contents.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          url: {
            type: "string",
            description: "A public http(s) URL to read."
          },
          max_characters: {
            type: "integer",
            minimum: 1000,
            maximum: 12000,
            description: "Maximum source text to return."
          }
        },
        required: ["url"]
      }
    }
  });
  tools.unshift({
    type: "function",
    function: {
      name: "search_web",
      description:
        "Search the live web with Exa for current facts, recent information, products, software, research, or source discovery. Returns titles, URLs, and concise relevant excerpts.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: {
            type: "string",
            description: "Natural-language search query."
          },
          num_results: {
            type: "integer",
            minimum: 1,
            maximum: 8,
            description: "Number of results to return. Use 5 for most tasks."
          }
        },
        required: ["query"]
      }
    }
  });
}

async function runReadWebpage(args: any) {
  const url = String(args?.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("read_webpage requires an http(s) URL");
  if (!process.env.EXA_API_KEY) throw new Error("read_webpage is unavailable because EXA_API_KEY is not configured.");
  const maxCharacters = Math.max(1000, Math.min(12000, Number(args?.max_characters ?? 6000) || 6000));

  const response = await fetch("https://api.exa.ai/contents", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.EXA_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      urls: [url],
      text: { maxCharacters }
    }),
    cache: "no-store"
  });

  const raw = await response.text();
  if (!response.ok) throw new Error("Exa contents request failed (" + response.status + "): " + extractError(raw));

  const data = JSON.parse(raw);
  const item = Array.isArray(data?.results) ? data.results[0] : null;
  return {
    type: "webpage",
    title: String(item?.title ?? ""),
    url: String(item?.url ?? url),
    publishedDate: item?.publishedDate ?? null,
    text: String(item?.text ?? "").slice(0, maxCharacters)
  };
}

async function runSearchWeb(args: any) {
  const query = String(args?.query ?? "").trim().slice(0, 2000);
  if (!query) throw new Error("search_web requires a query");
  if (!process.env.EXA_API_KEY) throw new Error("search_web is unavailable because EXA_API_KEY is not configured.");
  const numResults = Math.max(1, Math.min(8, Number(args?.num_results ?? 5) || 5));

  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.EXA_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query,
      type: "auto",
      numResults,
      contents: { highlights: true }
    }),
    cache: "no-store"
  });

  const raw = await response.text();
  if (!response.ok) throw new Error("Exa request failed (" + response.status + "): " + extractError(raw));

  const data = JSON.parse(raw);
  const results = Array.isArray(data?.results)
    ? data.results.slice(0, numResults).map((item: any) => ({
        title: String(item?.title ?? ""),
        url: String(item?.url ?? ""),
        publishedDate: item?.publishedDate ?? null,
        highlights: Array.isArray(item?.highlights)
          ? item.highlights.slice(0, 3).map((x: any) => String(x)).join("\n")
          : String(item?.text ?? "").slice(0, 1600)
      }))
    : [];

  return {
    type: "web_search",
    results
  };
}

async function runGithubReadFile(args: any) {
  const repository = String(args?.repository ?? "").trim();
  const path = String(args?.path ?? "").trim();
  const ref = String(args?.ref ?? "").trim();

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("repository must use owner/name format");
  }
  if (!path || path.length > 500) throw new Error("path is required and must be <= 500 characters");

  const encodedPath = path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const refPart = ref
    ? "?ref=" + encodeURIComponent(ref.slice(0, 100))
    : "";
  const url = "https://api.github.com/repos/" + repository + "/contents/" + encodedPath + refPart;

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "tarotai-core"
    },
    cache: "no-store"
  });

  const raw = await response.text();
  if (!response.ok) throw new Error("GitHub request failed (" + response.status + "): " + extractError(raw));

  const data = JSON.parse(raw);
  if (Array.isArray(data)) {
    return {
      type: "github_read",
      repository,
      path,
      entries: data.slice(0, 100).map((item: any) => ({
        name: item?.name,
        path: item?.path,
        type: item?.type,
        size: item?.size
      }))
    };
  }

  let fileText = "";
  if (data?.content && data?.encoding === "base64") {
    fileText = Buffer.from(String(data.content).replace(/\n/g, ""), "base64").toString("utf8");
  } else if (typeof data?.download_url === "string") {
    const fileResponse = await fetch(data.download_url, {
      headers: { "User-Agent": "tarotai-core" },
      cache: "no-store"
    });
    fileText = await fileResponse.text();
  }

  return {
    type: "github_read",
    repository,
    path,
    ref: ref || null,
    sha: data?.sha || null,
    content: fileText.slice(0, 20000),
    truncated: fileText.length > 20000
  };
}

async function executeTool(name: string, args: any) {
  if (name === "search_web") return runSearchWeb(args);
  if (name === "read_webpage") return runReadWebpage(args);
  if (name === "github_read_file") return runGithubReadFile(args);
  throw new Error("Unknown tool: " + name);
}

function compactToolEvent(name: string, args: any, output: any) {
  if (name === "search_web") {
    return {
      name,
      input: { query: String(args?.query ?? "").slice(0, 300) },
      output: {
        type: "web_search",
        results: Array.isArray(output?.results)
          ? output.results.slice(0, 6).map((x: any) => ({
              title: x.title,
              url: x.url,
              snippet: String(x.highlights ?? "").slice(0, 700)
            }))
          : []
      }
    };
  }

  if (name === "read_webpage") {
    return {
      name,
      input: { url: String(args?.url ?? "").slice(0, 500) },
      output: {
        type: "webpage",
        title: output?.title || "",
        url: output?.url || args?.url || "",
        characters: typeof output?.text === "string" ? output.text.length : 0
      }
    };
  }

  return {
    name,
    input: { repository: args?.repository, path: args?.path, ref: args?.ref ?? null },
    output: {
      type: "github_read",
      path: output?.path ?? args?.path,
      characters: typeof output?.content === "string" ? output.content.length : undefined,
      truncated: Boolean(output?.truncated)
    }
  };
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return Response.json(
        {
          error:
            "OPENROUTER_API_KEY is not configured. Add an OpenRouter API key to the Vercel Production environment, then redeploy.",
          setup: "The server is configured for direct OpenRouter transport."
        },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    const contentLength = Number(request.headers.get("content-length") || "0");
    if (contentLength > 256_000) {
      return Response.json(
        { error: "Request payload is too large." },
        { status: 413, headers: { "Cache-Control": "no-store" } }
      );
    }

    const body: any = await request.json().catch(() => ({}));
    const initialMessages = normalizeMessages(body?.messages);
    if (!initialMessages.length) {
      return Response.json(
        { error: "messages is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const model = process.env.OPENROUTER_MODEL || "openrouter/free";
    const messages: any[] = [
      { role: "system", content: system },
      ...initialMessages
    ];
    const toolEvents: any[] = [];
    const totalUsage: any = {};
    let finalData: any = null;

    for (let turn = 0; turn < 4; turn += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 110_000);

      let upstream: Response;
      try {
        upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + apiKey,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://tarotai-core.vercel.app",
            "X-Title": "tarotai"
          },
          body: JSON.stringify({
            model,
            messages,
            tools,
            tool_choice: tools.length ? "auto" : "none",
            parallel_tool_calls: false,
            max_tokens: 4096
          }),
          cache: "no-store",
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }

      const raw = await upstream.text();
      if (!upstream.ok) {
        const detail = extractError(raw);
        console.error("OpenRouter upstream error", upstream.status, detail);
        return Response.json(
          { error: "OpenRouter request failed (" + upstream.status + "): " + detail },
          { status: 502, headers: { "Cache-Control": "no-store" } }
        );
      }

      const data = JSON.parse(raw);
      finalData = data;

      if (data?.usage && typeof data.usage === "object") {
        for (const [key, value] of Object.entries(data.usage)) {
          if (typeof value === "number") totalUsage[key] = (totalUsage[key] || 0) + value;
        }
      }

      const message = data?.choices?.[0]?.message;
      const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];

      if (!toolCalls.length) {
        const text = message?.content;
        if (typeof text !== "string") {
          return Response.json(
            { error: "OpenRouter returned no assistant text." },
            { status: 502, headers: { "Cache-Control": "no-store" } }
          );
        }

        return Response.json(
          {
            text,
            toolEvents,
            finishReason: data?.choices?.[0]?.finish_reason || null,
            usage: Object.keys(totalUsage).length ? totalUsage : data?.usage || null,
            model: data?.model || model
          },
          { headers: { "Cache-Control": "no-store" } }
        );
      }

      messages.push({
        role: "assistant",
        content: typeof message?.content === "string" ? message.content : null,
        tool_calls: toolCalls
      });

      for (const call of toolCalls) {
        const name = String(call?.function?.name ?? "");
        let args: any = {};
        try {
          args = JSON.parse(String(call?.function?.arguments ?? "{}"));
        } catch {
          args = {};
        }

        try {
          const output = await executeTool(name, args);
          messages.push({
            role: "tool",
            tool_call_id: String(call?.id ?? ""),
            name,
            content: JSON.stringify(output).slice(0, 30000)
          });
          toolEvents.push(compactToolEvent(name, args, output));
        } catch (toolError) {
          const detail = toolError instanceof Error ? toolError.message : String(toolError);
          messages.push({
            role: "tool",
            tool_call_id: String(call?.id ?? ""),
            name,
            content: JSON.stringify({ error: detail })
          });
          toolEvents.push({
            name,
            input: args,
            output: { type: "error", error: detail }
          });
        }
      }
    }

    return Response.json(
      {
        text:
          finalData?.choices?.[0]?.message?.content ||
          "I reached the tool-execution limit before producing a final answer. Please retry.",
        toolEvents,
        finishReason: "tool_loop_limit",
        usage: Object.keys(totalUsage).length ? totalUsage : finalData?.usage || null,
        model: finalData?.model || model
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("tarotai chat error", error);
    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error && error.cause ? String(error.cause) : null;
    const detail = message.includes("aborted")
      ? "OpenRouter request timed out. Please retry."
      : cause
        ? message + " | cause: " + String(cause)
        : message;

    return Response.json(
      { error: detail },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
