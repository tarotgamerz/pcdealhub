#!/usr/bin/env python3
import json,sys
from pathlib import Path
from urllib.parse import urlparse,parse_qs
data=json.loads(Path('deals.json').read_text(encoding='utf-8'))
if not isinstance(data,list): raise SystemExit('deals.json must contain a JSON array')
errors=[]
for i,d in enumerate(data,1):
    aff=d.get('affiliate_url')
    if not aff: continue
    p=urlparse(aff)
    if p.scheme not in {'http','https'} or not p.netloc:
        errors.append(f"Deal {i} ({d.get('id')}): affiliate_url is not a valid URL")
        continue
    if 'amazon.in' in p.netloc.lower():
        tags=parse_qs(p.query).get('tag',[])
        if 'pcdealhub21-21' not in tags:
            errors.append(f"Deal {i} ({d.get('id')}): Amazon affiliate_url must contain tag=pcdealhub21-21")
if errors:
    print('\n'.join(errors)); sys.exit(1)
print(f'Affiliate-link validation passed for {sum(bool(d.get("affiliate_url")) for d in data)} link(s).')
