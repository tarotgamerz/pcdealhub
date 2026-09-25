---
description: Verify PCDealHub deals before publishing or updating the catalog
---

# Deal verifier skill

A deal is publishable only when the product identity, current price, seller, availability, warranty or terms, source URL, and check time are supported by evidence.

Process:
1. Resolve the exact model/SKU. Reject near-matches and ambiguous variants.
2. Open the retailer source directly when possible.
3. Record the current listed price and availability.
4. Record seller and relevant warranty/return terms.
5. Record a UTC checked_at timestamp.
6. Cross-check another retailer or authoritative source when the catalog policy requires it.
7. Reject listings that are out of stock, mismatched, unverifiable, or materially stale.
8. Never convert a normal price into a “deal” without a documented comparison/reference.
9. Never invent affiliate URLs or approval status.
10. After edits, run the repository deal validation workflow/checks.

A deal score is an internal deal-data signal. It must never be presented as a benchmark, lab score, product-quality rating, or independent review score.
