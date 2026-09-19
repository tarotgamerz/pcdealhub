# Cuelinks automation

PCDealHub can use Cuelinks as an affiliate/deal acquisition layer.

## What this does

The scheduled workflow fetches live Cuelinks offers, filters them for PC-hardware relevance, and stores them in:

`data/cuelinks-candidates.json`

Those candidates are not public deals. They remain `needs_verification` until seller, current price, availability, condition, warranty/returns and reference price are verified.

## Activation

Create a Cuelinks V3 API key with the minimum scope needed for the candidate feed:

- `read:offers` for live deals.
- `write:links` can later be added for automatic affiliate-link conversion.

Then add the key to the GitHub repository as:

`CUELINKS_API_KEY`

GitHub Actions will then run the candidate sync every 6 hours and on manual dispatch.

Cuelinks documents V3 live offers/deals and URL-to-affiliate-link conversion in its developer API.
