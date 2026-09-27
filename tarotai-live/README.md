# TarotAI runtime

Private operator-style AI command center for the owner.

## Current architecture

- Host: Vercel project `tarotai-core`
- Source: GitHub `tarotgamerz/pcdealhub`
- Production branch: `main`
- Root directory: `tarotai-live`
- Framework: Next.js App Router
- Node: 22.x
- Model transport: direct OpenRouter HTTP
- Default model: `openrouter/free`

## Runtime routes

- `/api/auth` — access-code session gate
- `/api/chat` — server-side OpenRouter chat proxy
- `/api/health` — runtime configuration/health check
- `/console.html` — operator console

The App Router is the only active route layer. Legacy `pages/` and top-level `api/` routes were removed to prevent duplicate routing.

## Tool layer

The chat runtime now supports an OpenRouter tool loop with bounded execution. The tool layer also includes `set_plan` for the operator console's execution plan. Read-only tools are `get_current_datetime`, `search_web` and `read_webpage` through Exa when `EXA_API_KEY` is present, plus `github_read_file`, `github_list_commits`, and `github_actions_runs` for public GitHub project context. Tool outputs are returned to the model and summarized in `toolEvents` for the console. The model is limited to four tool turns per request.

## Required production environment

Set this in Vercel Production environment variables:

`OPENROUTER_API_KEY`

Optional:

`OPENROUTER_MODEL`

Never commit or paste API keys into GitHub or chat.

## Verification

After a production deployment, open:

`/api/health`

Expected fields include:

- `runtime: "next-app-router"`
- `aiTransport: "direct-openrouter"`
- `hasOpenRouterKey: true`
- `model: "openrouter/free"`

Then send a real POST request to `/api/chat` through the console.

## Security notes

The browser console may keep local notes in `localStorage`, but those notes are not sent to the server chat endpoint. Server-side secrets are read only from environment variables.

The chat endpoint accepts user/assistant messages only, applies a 40-message cap, uses `no-store` caching, and enforces an upstream timeout.

Live tool integrations such as Exa and GitHub are not claimed until they are actually connected and verified.

## Advanced capabilities

TarotAI can now accept authenticated uploads for PDF, DOCX, PPTX, XLSX and common text formats through /api/documents. Extracted content is attached to chat as untrusted reference data, and the runtime can search attached-document text with search_attached_documents. The current upload size limit is 12 MB and extracted context is bounded.

The model prompt includes controlled policies for application access and cybersecurity assistance. Application automation is only enabled when a real Composio session is available. Composio uses a user-scoped Tool Router session so app credentials stay in the provider rather than the TarotAI browser or source code.

GitHub write execution is implemented but disabled by default. It requires a server-side GITHUB_WRITE_TOKEN, TAROTAI_GITHUB_WRITE_ENABLED=true, an allowed repository, and the operator's explicit Write ON session switch. Read-only GitHub tools remain available separately.

## Current production environment

Required: OPENROUTER_API_KEY, TAROTAI_ACCESS_CODE

For live web research: EXA_API_KEY

For connected application tooling: COMPOSIO_API_KEY

For guarded GitHub writes: GITHUB_WRITE_TOKEN and TAROTAI_GITHUB_WRITE_ENABLED=true

Never commit or paste API keys into GitHub or chat.

## Advanced capability activation

Production capabilities are deliberately server-configured:

- OPENROUTER_API_KEY: core model runtime.
- TAROTAI_ACCESS_CODE: required private access gate.
- EXA_API_KEY: live web search and webpage reading.
- UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN: durable private memory, chat history and task state.
- COMPOSIO_API_KEY: session-scoped connected applications; the console can start provider authorization links.
- GITHUB_WRITE_TOKEN + TAROTAI_GITHUB_WRITE_ENABLED=true: guarded GitHub writes; repository allowlist and console Write approval still apply.
- OPENROUTER_VISION_MODEL: optional override for image/OCR analysis; default uses a free multimodal model when available.

The browser never receives these server secrets.