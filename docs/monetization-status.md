# PCDealHub Monetization Status

Last reviewed: 2026-09-25

## Live / created

### Amazon Associates India
- Status: account created
- Associate ID: `pcdealhub21-21`
- Site disclosure is present on PCDealHub.
- Revenue is **not yet flowing automatically** because the public deal feed is still empty and qualified traffic/sales are required.
- Current Amazon rules require at least 3 qualifying sales within the first 180 days for application review; personal orders do not qualify.
- Price/availability data must come through permitted Amazon mechanisms; PCDealHub must not scrape or invent Amazon prices.

### Mitgo / Admitad
- Status: ad space created
- Next revenue step: connect/join relevant PC, electronics and ecommerce advertiser programs and generate approved deeplinks.

### vCommission
- Status: application in progress
- Site promotion method: website
- Next revenue step: complete approval, then inspect approved ecommerce campaigns and deeplink options.

## Waiting / needs user-side access

### Cuelinks
- Status: pending
- Repo automation is ready for a `CUELINKS_API_KEY` GitHub secret.
- Once credentials are available, GitHub Actions can refresh a review queue every 6 hours.
- The sync now captures offer price, discount, tracking URL, coupon, validity dates and terms while keeping everything **out of the public feed until verified**.

### Flipkart Affiliate
- Status: not yet applied
- Official tooling can provide product/feed information and affiliate links after access is granted.
- Next revenue step: complete publisher onboarding and obtain the required API/affiliate credentials.

### Optimise Media
- Status: not yet applied
- Next revenue step: publisher application, then inspect relevant electronics/ecommerce programs.

## Current monetization bottlenecks

1. At least one approved affiliate source needs to provide usable tracked product URLs; current retailer links are still direct URLs.
2. The public `deals.json` feed needs verified real products before it can generate consistent affiliate clicks.
3. Amazon account qualification still depends on genuine qualifying sales.
4. Cuelinks automation is blocked until the API credential/access is available.
5. Network approvals determine which merchants we can legally monetize through each network.

## Architecture

Candidate discovery -> review queue -> verification -> affiliate link conversion -> public deal feed -> click -> merchant -> commission.

**Rule:** no fake discounts, invented prices, unverified stock claims, or unapproved affiliate links.
