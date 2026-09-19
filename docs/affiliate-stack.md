# PCDealHub affiliate stack

Research date: 2026-09-19

## Current monetization routes

| Route | Status | Next action |
| --- | --- | --- |
| Amazon Associates India | account created | Build compliant Amazon product links |
| Cuelinks | pending | Keep pending; use API when credentials/access are available |
| Flipkart Affiliate | alternative to pursue | Apply/register and inspect API access |
| Admitad / Mitgo | account/ad space created | Connect PC/electronics advertisers |
| Optimise Media | alternative | Apply if useful for product feeds/deeplinks |
| vCommission | alternative | Apply and inspect electronics campaigns |

## Data model

`url` is the canonical retailer/listing URL.
`original_url` records the source listing when a redirect is involved.
`affiliate_url` is the tracked URL used by the public View Deal button.
`affiliate_network` records the attribution provider.

Affiliate approval is never treated as proof that a deal is good. A published deal still needs seller, current price, availability, condition, terms and reference-price checks.

## Amazon

Associate ID: `pcdealhub21-21`

Keep Amazon product links tagged with the Associate ID. For current Amazon price/availability data, use Amazon's permitted linking tools or Product Advertising API rather than scraping storefront pages.

## Flipkart

Flipkart's official affiliate documentation describes product feeds/API data including product URLs, prices and stock fields. This is a strong candidate for automated candidate discovery once affiliate access/API credentials are available.

## Cuelinks

Cuelinks V3 documents campaign discovery, offers/coupons, URL-to-affiliate-link conversion and reporting APIs. The repository already contains a candidate-sync scaffold, but the public deal feed remains protected by verification.

## Other networks

Admitad/Mitgo provides deeplink tooling. Optimise documents deeplinks and product/offer feeds. vCommission provides publisher/API tooling and should be evaluated after onboarding.

## Sources

- Amazon Associates India: https://affiliate-program.amazon.in/
- Amazon PA API registration: https://affiliate-program.amazon.in/help/topic/api/registration
- Amazon linking requirements: https://affiliate-program.amazon.in/help/operating/linking
- Flipkart Affiliate API docs: https://affiliate.flipkart.com/api-docs/affiliate_index.html
- Cuelinks developer docs: https://developers.cuelinks.com/docs
- Mitgo publisher help: https://support.mitgo.com/
- Optimise India: https://optimisemedia.com/in/
- Optimise partner tools: https://optimisemedia.com/partner-tools/
- vCommission: https://www.vcommission.com/
