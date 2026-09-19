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
    return {
        "source": "cuelinks",
        "source_id": str(raw.get("id", "")),
        "title": str(title).strip(),
        "merchant": str(merchant).strip(),
        "description": str(description).strip(),
        "url": str(url).strip(),
        "offer": raw,
        "collected_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
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
    OUT.write_text(json.dumps(candidates[:250], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(candidates[:250])} PC-relevant candidate offers to {OUT}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
