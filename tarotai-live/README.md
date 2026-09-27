# tarotai live runtime

This folder is the real server-backed version of the tarotai command center.

## Production behavior

- The browser UI sends conversations to `/api/chat`.
- `/api/chat` runs a real model through Vercel AI SDK + AI Gateway.
- Default model: `openai/gpt-5.6-sol`.
- The agent can plan, search via Exa, read public webpages, verify, and call an authorized task executor.
- `/api/auth` provides an optional HTTP-only private access cookie.
- Memory is currently stored in the browser and supplied as context on requests.

## Vercel environment

The model can use Vercel's automatic OIDC authentication in a Vercel deployment. For local/non-Vercel hosting, provide an `AI_GATEWAY_API_KEY`.

Optional:
- `TAROTAI_MODEL`
- `EXA_API_KEY`
- `TAROTAI_ACCESS_CODE`
- `TAROTAI_TOOL_EXECUTOR_URL`
- `TAROTAI_TOOL_EXECUTOR_TOKEN`
- `TAROTAI_AUTONOMOUS_PERMISSIONS`

Computer/application control intentionally uses an explicit executor hook. A normal website cannot safely reach the host PC's terminal or filesystem just because a model asks it to.
