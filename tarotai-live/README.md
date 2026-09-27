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

The chat runtime now supports an OpenRouter tool loop with bounded execution. It can use `search_web` and `read_webpage` through Exa when `EXA_API_KEY` is present, plus `github_read_file` for public GitHub repository context. Tool outputs are returned to the model and summarized in `toolEvents` for the console. The model is limited to four tool turns per request.

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
