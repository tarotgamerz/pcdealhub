# PCDealHub Operator setup

The Operator lives under the operator/ directory so the public PCDealHub Pages site remains independent.

## Runtime

- Vercel eve for the durable agent runtime.
- Next.js private web console.
- GitHub Tools for repository/issue/PR/CI operations.
- Vercel Connect for short-lived GitHub credentials.
- Isolated eve sandbox for agent-generated code.
- Protected owner memory and durable project memory.
- Research, implementation, and review subagents.
- Scheduled PCDealHub maintenance.

## Production capabilities already scaffolded

- autonomous task instructions;
- live web research;
- shell/file execution in the isolated sandbox;
- verification;
- researcher, implementer, and reviewer subagents;
- durable memory definitions;
- scheduled maintenance;
- GitHub maintainer and CI tool registration;
- private authenticated Next.js console.

## Required production secrets

- OPERATOR_PASSWORD — the owner's private console password.
- OPERATOR_SESSION_SECRET — a long random secret used to sign owner sessions.

Never commit either value to GitHub.

## GitHub connection

Use Vercel Connect so the Operator does not store a long-lived GitHub personal access token.

1. Link the operator/ directory to its Vercel project.
2. Run: vercel connect create github --name pcdealhub-operator
3. Run: vercel connect attach github/pcdealhub-operator
4. Install dependencies: npm install @github-tools/sdk @vercel/connect
5. When GitHub asks which repositories the managed GitHub App can access, scope it to PCDealHub only.
6. For GitHub event triggers, run: vercel connect attach github/pcdealhub-operator --triggers --trigger-path /eve/v1/github

GitHub write tools are intended to remain approval-gated.

## Deployment verification

Run npm run typecheck
Run npm run build
Run npm run build:eve
Deploy the operator from the operator/ directory.
Verify /eve/v1/health.
Verify unauthenticated requests are rejected.
Verify owner login.
Verify a research-only task.
Verify a repository-read task.
Verify a small repository write pauses for approval and resumes correctly.

## Zero-cost-first policy

Use free tiers where technically sound, but check current provider limits and pricing before relying on them. The goal is cost minimization, not pretending paid resources are free.

## Privacy

The GitHub repository is public. Never put owner-private profile data, email contents, passwords, API keys, OAuth tokens, private task history, or private agent memory into repository files.

The private console is the boundary for owner-only state.
