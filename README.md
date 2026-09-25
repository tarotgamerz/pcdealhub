# PCDealHub

**Live site:** https://tarotgamerz.github.io/pcdealhub/


PCDealHub is a free-to-use PC hardware deal discovery site focused on India.

## Current architecture

- `index.html` — public website and deal search UI.
- `deals.json` — the only public deal feed.
- `deals.schema.json` — expected data structure for verified deals.
- `.github/ISSUE_TEMPLATE/deal-submission.yml` — structured public deal submissions.
- `.github/workflows/validate.yml` — free GitHub Actions validation on changes.
- `.github/workflows/check-links.yml` — scheduled affiliate/public-link health checks.
- `.github/workflows/sync-deals.yml` — scheduled candidate collection when Cuelinks credentials are configured.
- `scripts/check_deal_links.py` — validates affiliate URLs and the Amazon Associates tag.
- `scripts/sync_cuelinks.py` — keeps unverified Cuelinks candidates out of the public feed.
- `data/affiliate-programs.json` — tracks the monetization/affiliate pipeline.
- `affiliate-disclosure.html`, `privacy.html`, `terms.html`, `contact.html` — trust and compliance pages.

## Publishing rule

Do **not** add a listing just because it looks cheap. Before publication, verify the seller, current price, availability, condition, warranty/returns and a reasonable reference price.

The site intentionally renders an empty state while `deals.json` is empty. This prevents fake or stale deal claims.

## Deal object

Each entry in `deals.json` must satisfy `deals.schema.json`. The GitHub Action also checks the essential fields on every push/PR.

## Traffic and discovery

- `deals.html` — dedicated verified PC deals landing page.
- `ssd-deals-under-20000.html` and `gaming-monitor-deals-under-15000.html` — budget-specific search entry pages.
- `feed.xml` — RSS feed for published deals.
- `robots.txt` + `sitemap.xml` — crawler discovery infrastructure.
- Search Console ownership and sitemap submission are still account-owner steps outside this repository.

## Zero-cost workflow

1. A deal can be submitted through the site's GitHub issue form or by email.
2. The deal is manually verified.
3. A verified entry is added to `deals.json`.
4. GitHub Actions validates the data.
5. GitHub Pages serves the updated site automatically.

## Next automation layer

The next stage is to connect approved retailer/affiliate feeds where permitted, normalize them into this same schema, and keep human verification as the final publication gate. The repository now has separate infrastructure for candidate discovery and published-link monitoring.
