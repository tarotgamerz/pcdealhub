# PCDealHub Operator setup

The Operator lives under the operator/ directory so the public PCDealHub Pages site remains independent.

## Runtime

Current design:
- Vercel eve for the durable agent runtime.
- Next.js private web console using the same eve session API.
- GitHub Tools maintainer preset with approvals.
- Isolated eve sandbox.
- Protected external owner memory.
- Scheduled maintenance definition.
- Research, implementation, and review subagents.

## Required production secrets

Set these in the private Vercel deployment:
- OPERATOR_PASSWORD — the owner's private console password.
- OPERATOR_SESSION_SECRET — a long random secret used to sign owner sessions.

Never commit either value to GitHub.

## Deployment shape

Deploy from the operator/ directory, not the repository root, when creating the private Operator Vercel project. The included Vercel configuration declares the Next.js web service and Eve runtime service.

The intended production flow is:
1. Install dependencies.
2. Run npm run typecheck.
3. Run npm run build.
4. Run npm run build:eve.
5. Deploy the combined Vercel service.
6. Verify /eve/v1/health.
7. Verify unauthenticated session requests are rejected.
8. Verify authenticated owner login and a real agent turn.
9. Verify approval requests pause and later resume.
10. Keep production credentials in Vercel and Connect, never in source control.

## Zero-cost-first policy

Use free tiers where possible, but check current provider limits and pricing before relying on them. The goal is cost minimization, not pretending paid runtime resources are free.

## Privacy

The GitHub repository is public. Never put owner private profile data, email contents, passwords, API keys, OAuth tokens, private task history, or private agent memory into repository files.

The private console is the boundary for owner-only state.
