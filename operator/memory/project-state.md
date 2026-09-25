# PCDealHub project state

Last synchronized: 2026-09-25

## Product
PCDealHub is an India-focused PC hardware deals, buying-guide, comparison, and build-planning website.

## Operating philosophy
- Trust and exactness matter more than catalog size.
- Reject ambiguous, out-of-stock, or model-mismatched deals.
- Record current price, seller, stock, warranty/terms, source URL, and check time.
- Internal deal scores are data-quality/deal signals, not product-quality or benchmark scores.
- Prefer legitimate direct retailer URLs until verified affiliate URLs are available.
- Keep affiliate disclosures and transparency visible.

## Current verified catalog
The project context has 12 verified deals as of 2026-09-25. The canonical detailed list is maintained in docs/pcdealhub-ai-context.md and the live deals.json.

## Existing site areas
- Homepage
- Deals page and JSON catalog
- Build planner
- Comparison and saved-deals tools
- Category deal hubs
- Buying guides
- Sitemap, RSS, robots, llms.txt
- Affiliate disclosure, privacy, terms, contact, verification, and submit-deal pages
- Public PCDealHub AI customer assistant

## Operator
The private Operator is intentionally separate from the public customer assistant.
Its job is autonomous maintenance and general task execution with research, sandboxed code execution, verification, durable memory, approvals, and an audit trail.

## Current blocker
The private Hostinger AI Builder control panel was created, but subsequent edits exhausted its available builder credits. Treat that UI as a shell/control surface until the actual agent runtime is connected.
