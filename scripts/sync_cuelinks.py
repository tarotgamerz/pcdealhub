#!/usr/bin/env python3
"""
Pull PC-relevant Cuelinks offers into a review queue.

This script NEVER publishes offers to the public deal feed.
It only creates data/cuelinks-candidates.json for human verification.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

BASE = "https://developers.cuelinks.com/pub_api/v3/offers"
OUT = Path("data/cuelinks-candidates.json")
KEYWORDS = {
    "gpu","graphics card","rtx","gtx","radeon","rx 5","rx 6","rx 7","rx 8",
    "cpu","processor","ryzen","core i3","core i5","core i7","core i9",
    "ram","ddr4","ddr5","memory","ssd","nvme","storage","hdd",
    "motherboard","cabinet","pc case","power supply","psu","smps",
    "cooler","cpu cooler","gaming pc","desktop","monitor","gaming monitor"
}

def get_json(page: int) -> dict:
    token = os.environ.get("CUELINKS_API_KEY", "").strip()
    if not token:
        print("CUELINKS_API_KEY is not configured; skipping sync.")
        return {}
    url = f"{BASE}?offer_type=deal&per_page=100&page={page}"
    req = Request(url, headers={
        "Authorization": f"Token {token}",
        "Accept": "application/json",
        "User-Agent": "PCDealHub/1.0"
    })
    with urlopen(req, timeout=30) as response:
        if response.status != 200:
            raise RuntimeError(f"Cuelinks HTTP {response.status}")
        return json.load(response)

def text_blob(obj: object) -> str:
    if isinstance(obj, dict):
        return " ".join(text_blob(v) for v in obj.values())
    if isinstance(obj, list):
        return " ".join(text_blob(v) for v in obj)
    return str(obj or "")

def normalize(raw: dict) -> dict:
    campaign = raw.get("campaign") if isinstance(raw.get("campaign"), dict) else {}
    title = raw.get("title") or raw.get("name") or raw.get("offer_title") or ""
    merchant = (raw.get("merchant") or raw.get("merchant_name") or raw.get("brand")
                or campaign.get("name") or "")
    url = raw.get("url") or raw.get("landing_url") or raw.get("product_url") or ""
    description = raw.get("description") or raw.get("details") or ""
    categories = raw.get("categories") if isinstance(raw.get("categories"), list) else []
    campaign_id = raw.get("campaign_id") or campaign.get("id")
    return {
        "source": "cuelinks",
        "source_id": str(raw.get("id", "")),
        "campaign_id": campaign_id,
        "campaign": str(campaign.get("name", "")).strip(),
        "title": str(title).strip(),
        "merchant": str(merchant).strip(),
        "categories": categories,
        "description": str(description).strip(),
        "url": str(url).strip(),
        "tracking_url": str(raw.get("tracking_url") or raw.get("affiliate_url") or "").strip(),
        "original_price": raw.get("original_price"),
        "discount_price": raw.get("discount_price"),
        "percent_off": raw.get("percent_off"),
        "shipping_charge": raw.get("shipping_charge"),
        "coupon_code": raw.get("coupon_code"),
        "offer_type": raw.get("offer_type"),
        "start_date": raw.get("start_date"),
        "end_date": raw.get("end_date"),
        "terms": str(raw.get("terms") or "").strip(),
        "status": "needs_verification"
    }

def main() -> int:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    if not os.environ.get("CUELINKS_API_KEY", "").strip():
        return 0

    candidates = []
    seen = set()
    for page in range(1, 6):
        payload = get_json(page)
        batch = payload.get("data", [])
        if not isinstance(batch, list) or not batch:
            break
        for raw in batch:
            if not isinstance(raw, dict):
                continue
            hay = text_blob(raw).lower()
            if not any(k in hay for k in KEYWORDS):
                continue
            item = normalize(raw)
            key = item["source_id"] or item["url"] or item["title"].lower()
            if key and key not in seen:
                seen.add(key)
                candidates.append(item)
        meta = payload.get("meta", {})
        if isinstance(meta, dict):
            total_pages = meta.get("total_pages")
            if total_pages and page >= int(total_pages):
                break

    candidates.sort(key=lambda x: (x["merchant"].lower(), x["title"].lower()))
    # Keep a bounded review queue while preserving live offer metadata needed for verification.
    new_data = candidates[:250]
    existing_data = []
    if OUT.exists():
        try:
            previous = json.loads(OUT.read_text(encoding="utf-8"))
            existing_data = previous if isinstance(previous, list) else []
        except json.JSONDecodeError:
            existing_data = []
    if new_data != existing_data:
        OUT.write_text(json.dumps(new_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Candidate queue changed: {len(new_data)} PC-relevant offers")
    else:
        print("Candidate queue unchanged; no commit required.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
