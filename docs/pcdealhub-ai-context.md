# PCDealHub AI — Project Context

Last updated: 2026-09-25

## Project
PCDealHub is a zero-cost-first PC hardware deal and buying-guide website for shoppers in India.

Repository:
https://github.com/tarotgamerz/pcdealhub

Public site address:
https://tarotgamerz.github.io/pcdealhub/

Primary goals:
- Publish trustworthy PC hardware deals.
- Compare exact models across retailers when possible.
- Build useful India-focused buying guides.
- Grow organic/social traffic.
- Monetize through legitimate affiliate programs without fabricating affiliate links.
- Keep operating costs near zero.

## Current site state
The repository contains:
- Homepage and deal search/filter UI.
- Dedicated verified deals page.
- Public deals.json feed and schema.
- GPU/CPU/RAM/SSD/monitor deal hubs.
- Build planner.
- Comparison page.
- Saved deals using browser localStorage.
- Buying-guide directory and India-focused guides.
- RSS feed.
- robots.txt and sitemap.xml.
- FAQ, privacy, terms, affiliate disclosure, contact, verification, submit-deal pages.
- GitHub Actions validation/link-check workflows.
- IndexNow key.
- Marketing and monetization documentation.

Current tracked catalog:
- 12 verified deals.
- Each deal has a unique ID and verification flags for price, seller, availability, terms and reference price.
- Deal scores are internal PCDealHub deal-data signals, NOT product-quality ratings, benchmarks or lab-test scores.
- Retailer URLs are currently direct URLs unless an actual affiliate_url is supplied later.

Current verified deals include:
1. WD Green SN3000 1TB NVMe Gen4 SSD — ₹14,660 — MD Computers.
2. LG 24GS65F-B 24-inch FHD IPS 180Hz Gaming Monitor — ₹11,390 — Vedant Computers.
3. Gigabyte Radeon RX 7600 Gaming OC 8GB GDDR6 — ₹34,803 — MD Computers.
4. MSI MAG 245F X24 24-inch FHD 240Hz Gaming Monitor — ₹9,150 — Vedant Computers.
5. Samsung Odyssey G3 LS24DG302EWXXL 24-inch Gaming Monitor — ₹10,209 — MD Computers.
6. WD Black SN7100 1TB NVMe Gen4 SSD — ₹17,690 — Vedant Computers.
7. AMD Ryzen 5 5600 Processor — ₹13,135 — MD Computers.
8. Corsair Vengeance LPX 16GB DDR4 3200MHz C16 — ₹10,400 — MD Computers.
9. ZOTAC Gaming GeForce RTX 3050 Twin Edge OC 6GB GDDR6 — ₹18,799 — MD Computers.
10. ViewSonic VX2428J 24-inch FHD 180Hz Gaming Monitor — ₹13,499 — KRGkart.
11. LG UltraGear 24GS60F-B 24-inch FHD IPS 180Hz Gaming Monitor — ₹10,300 — MD Computers.
12. AMD Ryzen 5 5500 Processor — ₹8,900 — MD Computers.

Recent original guides:
- Ryzen 5 5500 India Buying Guide.
- LG 24GS60F-B India Buying Guide.
- Plus earlier GPU, CPU, SSD, monitor, RAM, used-PC and budget-build guides.

## Deal quality philosophy
Do not pad the catalog with weak listings just to increase the deal count.
Reject products when:
- Exact model/SKU is ambiguous.
- Current stock is not clear.
- Cross-retailer comparison is not clean.
- Seller identity or purchase terms are unclear.
- The price looks outdated or suspicious.
Trust and accuracy matter more than quantity.

## Monetization status
Amazon Associates India:
- Associate ID: pcdealhub21-21.
- Application review requires qualifying sales before final approval.
- No Amazon approval/rejection email was found in the recent mailbox search.
- Recent Amazon mail was account-verification related.

vCommission:
- Application ID: TR-132349.
- On 2026-09-21, vCommission said PCDealHub is still in development without consistent active traffic and therefore cannot be approved at this stage.
- They invited re-application/review after the site has relevant content and consistent traffic.
- Later vCommission promotional emails are marketing messages, not approval.

Admitad:
- A welcome/onboarding message was received on 2026-09-19.
- Treat this as onboarding evidence, not as proof of monetization or payout eligibility.

Cuelinks:
- No clear current approval/status was found in the recent mailbox search.

Flipkart:
- Earlier registration/availability issues were reported; do not claim current approval without fresh verification.

Never invent an affiliate relationship.
Never alter direct retailer URLs to fake tracking links.
Use a real affiliate URL only when supplied by a legitimate network/account.

## GitHub / deployment
GitHub write access is available for repository maintenance.
Latest main commit at the time this context was written:
672c6752c7ecb4104656f31b7d339a9da0dd8bca
This adds the PCDealHub AI widget script to:
- index.html
- deals.html
- start-here.html
- build-planner.html
- guides/index.html

GitHub Pages had previously successfully deployed the 12-deal build. Later guide/sitemap changes triggered a newer queued deployment.
Custom validate/link-check workflows have repeatedly failed before creating jobs; the exact root cause is not established.

## PCDealHub AI
A public Outside Agent was created and published:
Name: PCDealHub AI
Slug: pcdealhub-ai
Public link:
https://outsideagent.ai/a/pcdealhub-ai

Its current published capabilities:
- Web chat.
- Live web search capability.
- Knowledge base.
- Read webpage.
- Current date/time.
- Floating website widget.

The widget snippet:
<script src="https://api.outsideagent.ai/widget.js" data-agent="pcdealhub-ai" async></script>

The agent knowledge base contains the current verified deal records that successfully indexed. Some semantically similar deal documents were rejected by the knowledge-base conflict gate; this is expected protection against contradictory duplicate facts.

A live test confirmed that the published agent can retrieve exact PCDealHub deal facts, including the Ryzen 5 5600 price, seller, reference price, checked timestamp and URL.

Important limitation:
- Outside Agent creator credits were exhausted while attempting a final behavior refinement.
- Therefore the published agent should not be described as having unlimited execution or guaranteed live-search enforcement for every current-price question.
- Do not claim that the attempted final hard rule was successfully deployed.

## Desired next-generation agent
The long-term target is a powerful PCDealHub operator/AI that can:
- Maintain persistent project memory.
- Research current hardware prices and availability.
- Inspect specific retailer pages.
- Maintain and validate the deal catalog.
- Create/update buying guides.
- Monitor affiliate email and application status.
- Work with GitHub for controlled content/code changes.
- Run scheduled checks and maintenance.
- Keep an audit trail of what it changed and why.
- Detect conflicts/stale data before publishing.
- Self-test with repeatable evals.
- Ask for approval before consequential actions such as publishing, financial/account changes, destructive edits, or sending messages externally.
- Provide the public website chat experience as its front end.

The agent should be autonomous in research and routine maintenance, but it must not be given unrestricted destructive authority.

## User working preference
The project should be advanced proactively instead of requiring a command for every tiny step.
Prefer free/low-cost infrastructure.
Give concise progress updates and focus on practical results.
Never claim a deployment, approval, live price or traffic result without evidence.
