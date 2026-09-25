# PCDealHub Operator

A private owner-operated autonomous agent for maintaining PCDealHub and handling general project tasks.

## Goal

The Operator is separate from the public PCDealHub customer assistant. It is designed to:

1. Understand an owner task.
2. Inspect the current project state.
3. Research unfamiliar or time-sensitive information.
4. Execute safe changes in an isolated workspace.
5. Test and verify the result.
6. Correct failures and retry.
7. Record durable lessons and project facts.
8. Request approval for destructive or consequential actions.

## Planned runtime

This directory is structured for Vercel eve. eve currently supports Markdown instructions/skills, TypeScript tools, isolated sandboxes, durable workflows, approvals, subagents, channels, schedules, and evaluations. The runtime is intentionally kept separate from the static GitHub Pages site.

## Owner access

The intended interface is the private **PCDealHub Operator** app. Public users must never receive access to the Operator workspace, private memory, task logs, approvals, or project controls.

## Cost policy

Prefer zero-cost or free-tier paths where they are technically sound. Never hide usage costs or claim a paid service is free.
