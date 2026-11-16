#!/usr/bin/env python3
"""
Facts for the Explore home pages (lk_home.py), read from the published /explore/ pages themselves:
nothing comes from the database, so the home pages can only show what a visitor can already open.

    python scripts/lk_home_scan.py <cache-dir> [lang ...]      # all languages when none given

Writes <cache-dir>/<lang>.json: a list of pages
    {rel, kind (city|country|attr), h1, img, desc, can, robots, lat, lng, type, min, lead, prose,
     crumbs [[href, text]], alt {hreflang: url}}
Reading ~28k files takes well under a minute on a local disk; run it per language group if needed.
"""
import html
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "explore")

R = {k: re.compile(v, re.S) for k, v in {
    "h1": r'<section class="hero[^"]*".*?<h1[^>]*>(.*?)</h1>',
    "img": r'<meta property="og:image" content="([^"]*)"',
    "desc": r'<meta name="description" content="([^"]*)"',
    "can": r'<link rel="canonical" href="([^"]+)"',
    "robots": r'<meta name="robots" content="([^"]+)"',
    "lat": r'"latitude"\s*:\s*"?(-?[\d.]+)',
    "lng": r'"longitude"\s*:\s*"?(-?[\d.]+)',
    "geo": r'<p class="geo">(.*?)</p>',
    "min": r'data-min="([^"]*)"',
    "lead": r'<p class="lead">(.*?)</p>',
    "prose": r'<div class="prose">(.*?)</div>',
    "crumbs": r'<nav class="crumbs"[^>]*>(.*?)</nav>',
}.items()}
ALT = re.compile(r'<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"')
A = re.compile(r'<a href="([^"]+)"[^>]*>(.*?)</a>|<span>(.*?)</span>', re.S)
TAG = re.compile(r"<[^>]+>")


def txt(s):
    return html.unescape(TAG.sub("", s or "")).strip()


def one(path, rel, kind):
    s = open(path, encoding="utf-8", errors="replace").read()
    head = s[: s.find("</head>")] if "</head>" in s else s[:20000]
    g = lambda k: (R[k].search(s).group(1) if R[k].search(s) else "")
    geo = txt(g("geo"))
    typ = geo.split("·")[-1].strip() if "·" in geo else ""
    if re.search(r"\d+(\.\d+)?°", typ):
        typ = ""
    crumbs = []
    for m in A.finditer(g("crumbs")):
        crumbs.append([m.group(1) or "", txt(m.group(2) if m.group(1) else m.group(3))])
    return {
        "rel": rel, "kind": kind, "h1": txt(g("h1")), "img": html.unescape(g("img")),
        "desc": html.unescape(g("desc")), "can": g("can"), "robots": g("robots"),
        "lat": g("lat"), "lng": g("lng"), "type": typ, "min": html.unescape(g("min")),
        "lead": txt(g("lead")), "prose": len(txt(g("prose"))), "crumbs": crumbs,
        "alt": {h: u for h, u in ALT.findall(head)},
    }


def scan(lang, shard=0, shards=1):
    jobs = []
    ld = os.path.join(ROOT, lang)
    for name in sorted(os.listdir(ld)):
        p = os.path.join(ld, name)
        if name.endswith(".html") and name != "index.html":
            jobs.append((p, f"{lang}/{name}", "city"))
        elif os.path.isdir(p):
            kind = "country" if name == "country" else "attr"
            for f in sorted(os.listdir(p)):
                if f.endswith(".html") and f != "index.html":
                    jobs.append((os.path.join(p, f), f"{lang}/{name}/{f}", kind))
    # first reads on a synced (OneDrive) folder are slow per file, not per byte: read in parallel
    jobs = jobs[shard::shards]
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(96) as ex:
        return list(ex.map(lambda j: one(*j), jobs))


if __name__ == "__main__":
    cache = sys.argv[1]
    os.makedirs(cache, exist_ok=True)
    langs = sys.argv[2:] or sorted(d for d in os.listdir(ROOT)
                                   if d != "assets" and os.path.isdir(os.path.join(ROOT, d)))
    for spec in langs:  # "en" or a shard "en@3/12" (written as en@3.json; lk_home.py merges them)
        lang, _, sh = spec.partition("@")
        rows = scan(lang, *(map(int, sh.split("/")) if sh else (0, 1)))
        name = lang + (f"@{sh.split('/')[0]}" if sh else "")
        with open(os.path.join(cache, name + ".json"), "w", encoding="utf-8", newline="\n") as fh:
            json.dump(rows, fh, ensure_ascii=False, separators=(",", ":"))
        print(spec, len(rows), "pages")
