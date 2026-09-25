---
cron: "0 9 * * *"
---

Run a read-first daily PCDealHub maintenance audit.

Inspect:
- deal freshness and invalid/ambiguous entries,
- obvious broken internal links,
- sitemap consistency,
- public-page structure,
- GitHub workflow/deployment state,
- monetization documentation for obviously stale status notes.

Use current sources for anything time-sensitive.

Do not publish destructive or consequential changes automatically.
Prepare safe fixes for owner approval and report the highest-value maintenance actions.
