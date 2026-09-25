# PCDealHub Operator

Private autonomous AI workspace for PCDealHub.

The Operator is designed to understand an outcome, research unfamiliar/current information, inspect and edit project files, execute shell commands in an isolated Eve sandbox, use GitHub tools and browser automation, delegate research/review, retain stable memory, recover from failures, and verify completed work.

## Private access

The first version uses an owner password stored only in deployment secrets.

Set:
- `OPERATOR_ACCESS_PASSWORD`
- `OPERATOR_SESSION_SECRET`

Never commit either value.

## Model

Set `OPERATOR_MODEL` to the model you want. The source defaults to a high-capability model but is configurable so the operator can be tuned for cost or capability.

## GitHub

Set `GITHUB_TOKEN` only in the deployment environment. The Eve GitHub extension reads it automatically when no Vercel Connect connector is configured.

GitHub writes remain approval-gated.

## Local development

Node 24+ is required.

```bash
npm install
npm run eve:build
npm run dev
```

## Deployment

This project is prepared for Vercel + Eve deployment. Configure the required environment variables before exposing the app.

The agent should learn ordinary new information through web research and persistent memory rather than retraining its model. Safety/instruction files remain separate from learned memory.
