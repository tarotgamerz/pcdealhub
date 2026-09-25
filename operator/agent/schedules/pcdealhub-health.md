---
cron: "0 */6 * * *"
---

Run a PCDealHub maintenance sweep.

Inspect the repository and look for:
- broken or missing key pages;
- obvious malformed HTML or JSON;
- stale or missing sitemap or robots references;
- failed or suspicious build/deployment status when accessible;
- deal data with missing required fields;
- accidental fake/placeholder affiliate URLs;
- documentation drift between the project context and actual files.

Research current information only when needed to verify a suspected issue.

Make only safe, reversible fixes automatically.
Record findings and changes.
Escalate destructive, financial, credential, or consequential publishing actions for owner approval.
