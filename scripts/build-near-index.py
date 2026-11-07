#!/usr/bin/env python3
"""
Nearby index for the app card (lk-sheet.js) — Beka 2026-11-07: "every page's
popup must name the places around it".

Writes public/explore/assets/near/<lang>/<city>.json:
    { "<slug>": [["<place name>", <km>], ...], ... }   (nearest first)

Two tiers, and the card picks by distance (lk-sheet.js SETTINGS):
  * walking — places within WALK_KM (3 km): "Nearby: A 200 m · B 1.4 km";
  * area    — only when there is nothing within walking distance: the closest
              places within AREA_KM (50 km): "In the area: C 12 km".
With neither, the card keeps its "{city}: more free audio guides" line; with no
file / no entry it falls back to the page's own Nearby rail. Nothing here is
invented: every name, coordinate and distance comes from our own published
/explore/ pages (h1 + JSON-LD geo).

Rules
  * neighbours = other attraction pages in the same language (great-circle
    distance between the pages' JSON-LD coordinates);
  * never the page itself, a page with the same canonical, the same name, or a
    noindex duplicate (those point their canonical at another page);
  * within each tier a language with fewer than KEEP neighbours is topped up
    with the English pages around it (Latin names), skipping anything within
    SAME_PLACE_M of the page or of a neighbour already listed — that is the
    same place again;
  * names are de-duplicated (case/diacritics-insensitive), and so are repeats of
    one place: the English twin (hreflang="en") of the page or of a listed
    neighbour, the same slug, or one name inside the other less than 1 km apart
    ("Kabuki-za" / "Kabuki-za Theatre").

Run after any (re)generation of /explore/ pages:
    python scripts/build-near-index.py                  # scans public/explore
    python scripts/build-near-index.py --tsv a.tsv ... --twins t.tsv ...  # or reuse an extract
TSV columns: rel(lang/city/file.html) \t h1 \t lat \t lng \t canonical \t robots
twins TSV:   rel \t the page's hreflang="en" URL
"""
import argparse
import html
import json
import math
import os
import re
import statistics
import sys
import unicodedata
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "explore")
OUT = os.path.join(ROOT, "assets", "near")
WALK_KM = 3.0       # = lk-sheet SETTINGS.nearbyMaxKm
AREA_KM = 50.0      # = lk-sheet SETTINGS.areaMaxKm
RADIUS_KM = AREA_KM
KEEP = 5            # stored per page; the card shows SETTINGS.nearbyCount / areaCount of them
SUSPECT_KM = 80     # a page this far from the median of its city folder (all languages, ≥3 pages)
                    # has doubtful coordinates: it gets no list and is nobody's neighbour
SAME_PLACE_M = 100  # an English page this close to the page (or to a listed neighbour) is the same place

H1 = re.compile(r'class="hero[^"]*".*?<h1[^>]*>(.*?)</h1>', re.S)
LAT = re.compile(r'"latitude"\s*:\s*"?(-?[\d.]+)')
LNG = re.compile(r'"longitude"\s*:\s*"?(-?[\d.]+)')
CAN = re.compile(r'<link rel="canonical" href="([^"]+)"')
ROB = re.compile(r'name="robots" content="([^"]+)"')
HL_EN = re.compile(r'<link rel="alternate" hreflang="en" href="([^"]+)"')
TWIN = {}  # (lang, city, slug) -> "city/slug" of the English page about the same place


def scan():
    for lang in sorted(os.listdir(ROOT)):
        ld = os.path.join(ROOT, lang)
        if lang == "assets" or not os.path.isdir(ld):
            continue
        for city in sorted(os.listdir(ld)):
            cd = os.path.join(ld, city)
            if city == "country" or not os.path.isdir(cd):
                continue
            for f in sorted(os.listdir(cd)):
                if not f.endswith(".html") or f == "index.html":
                    continue
                s = open(os.path.join(cd, f), encoding="utf-8", errors="replace").read()
                hl = HL_EN.search(s)
                if lang != "en" and hl:
                    add_twin(lang, city, f[:-5], hl.group(1))
                g = lambda rx: (rx.search(s).group(1) if rx.search(s) else "")
                h = H1.search(s)
                yield (f"{lang}/{city}/{f}", re.sub(r"<[^>]+>", "", h.group(1)).strip() if h else "",
                       g(LAT), g(LNG), g(CAN), g(ROB))


def read_tsv(paths):
    for p in paths:
        for line in open(p, encoding="utf-8-sig"):
            parts = line.rstrip("\r\n").split("\t")
            if len(parts) == 6 and parts[0] != "ERR":
                yield tuple(parts)


def add_twin(lang, city, slug, en_url):
    m = re.search(r"/explore/en/([^/]+)/([^/]+?)\.html", en_url)
    if m:
        TWIN[(lang, city, slug)] = f"{m.group(1)}/{m.group(2)}"


def read_twins(paths):
    for p in paths:
        for line in open(p, encoding="utf-8-sig"):
            parts = line.rstrip("\r\n").split("\t")
            if len(parts) == 2 and parts[1]:
                lang, city, f = parts[0].split("/", 2)
                add_twin(lang, city, f[:-5], parts[1])


def norm(s):
    s = unicodedata.normalize("NFKD", s.lower())
    return re.sub(r"[\W_]+", "", "".join(c for c in s if not unicodedata.combining(c)))


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tsv", nargs="*")
    ap.add_argument("--out", default=OUT, help="output folder (default public/explore/assets/near)")
    ap.add_argument("--twins", nargs="*", help="with --tsv: rel \\t hreflang-en URL lines (same-place map)")
    args = ap.parse_args()
    if args.twins:
        read_twins(args.twins)
    rows = read_tsv(args.tsv) if args.tsv else scan()

    pages = []
    for rel, h1, lat, lng, can, rob in rows:
        lang, city, f = rel.split("/", 2)
        name = html.unescape(h1).strip()
        try:
            geo = (float(lat), float(lng))
        except ValueError:
            geo = None
        if geo and not (-90 <= geo[0] <= 90 and -180 <= geo[1] <= 180):
            geo = None
        pages.append(dict(lang=lang, city=city, slug=f[:-5], name=name, geo=geo, can=can.strip(),
                          dup="noindex" in rob.lower(), key=norm(name)))

    # doubtful coordinates (e.g. a Demre church geocoded to Galway): compare every page
    # with the median position of its city folder across all languages
    folder = defaultdict(list)
    for p in pages:
        if p["geo"]:
            folder[p["city"]].append(p["geo"])
    med = {c: (statistics.median(g[0] for g in v), statistics.median(g[1] for g in v))
           for c, v in folder.items() if len(v) >= 3}
    suspect = []
    for p in pages:
        if p["geo"] and p["city"] in med and km(p["geo"], med[p["city"]]) > SUSPECT_KM:
            suspect.append(f'{p["lang"]}/{p["city"]}/{p["slug"]}')
            p["geo"] = None

    # candidate pools: indexable pages with a name and coordinates, bucketed on a grid
    # whose cells (GRID degrees ≈ 55 km of latitude) are at least RADIUS_KM tall
    GRID = 0.5
    assert GRID * 111 > RADIUS_KM

    def cell(g):
        return (int(math.floor(g[0] / GRID)), int(math.floor(g[1] / GRID)))

    pool = defaultdict(lambda: defaultdict(list))  # lang -> cell -> [page]
    for p in pages:
        if p["geo"] and p["name"] and not p["dup"]:
            pool[p["lang"]][cell(p["geo"])].append(p)

    def around(lang, p):
        cx, cy = cell(p["geo"])
        span_y = int(math.ceil(RADIUS_KM / (GRID * 111 * max(0.02, math.cos(math.radians(p["geo"][0])))))) + 1
        out = []
        for dx in (-1, 0, 1):
            for dy in range(-span_y, span_y + 1):
                for q in pool[lang].get((cx + dx, cy + dy), ()):
                    d = km(p["geo"], q["geo"])
                    if d <= RADIUS_KM:
                        out.append((d, q))
        out.sort(key=lambda t: (t[0], t[1]["name"]))
        return out

    files = defaultdict(dict)
    stats = defaultdict(lambda: [0, 0, 0, 0, 0])  # lang -> pages, any, own-lang only, topped up with EN, walking tier
    for p in pages:
        st = stats[p["lang"]]
        st[0] += 1
        if not p["geo"]:
            continue
        own_all = [(d, q) for d, q in around(p["lang"], p)
                   if q is not p and q["key"] != p["key"] and not (p["can"] and q["can"] == p["can"])]
        en_all = [] if p["lang"] == "en" else [
            (d, q) for d, q in around("en", p)
            if q["key"] != p["key"] and q["slug"] != p["slug"] and d * 1000 >= SAME_PLACE_M]

        def twin(x):
            return TWIN.get((x["lang"], x["city"], x["slug"]))

        def same_place(q, d, out):
            """q repeats the page or a listed neighbour: it is their English twin
            (hreflang="en"), shares their slug, or one name contains the other
            ("Kabuki-za" / "Kabuki-za Theatre") with the two less than 1 km apart."""
            if q["slug"] == p["slug"] or any(q["slug"] == c["slug"] for _, c in out):
                return True
            if q["lang"] == "en" and p["lang"] != "en":
                qk = f'{q["city"]}/{q["slug"]}'
                if qk == twin(p) or any(qk == twin(c) for _, c in out):
                    return True
            k = q["key"]
            if len(k) >= 5 and d < 1 and (k in p["key"] or p["key"] in k):
                return True
            return any(len(k) >= 5 and (k in c["key"] or c["key"] in k) and km(q["geo"], c["geo"]) < 1
                       for _, c in out)

        def pick(lo, hi):
            out, seen = [], {p["key"]}
            for d, q in own_all:
                if lo < d <= hi and q["key"] not in seen and not same_place(q, d, out):
                    seen.add(q["key"]); out.append((d, q))
                    if len(out) == KEEP:
                        return out, len(out)
            own = len(out)
            for d, q in en_all:
                if not (lo < d <= hi) or q["key"] in seen or same_place(q, d, out):
                    continue
                if any(km(q["geo"], c["geo"]) * 1000 < SAME_PLACE_M for _, c in out):
                    continue
                seen.add(q["key"]); out.append((d, q))
                if len(out) == KEEP:
                    break
            out.sort(key=lambda t: t[0])
            return out, own

        chosen, own = pick(-1, WALK_KM)
        tier = "walk"
        if not chosen:
            chosen, own = pick(WALK_KM, AREA_KM)
            tier = "area"
        if chosen:
            st[1] += 1
            st[2 if len(chosen) == own else 3] += 1
            st[4] += tier == "walk"
            files[(p["lang"], p["city"])][p["slug"]] = [[q["name"], round(d, 2)] for d, q in chosen]

    written = 0
    for (lang, city), data in sorted(files.items()):
        d = os.path.join(args.out, lang)
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, city + ".json"), "w", encoding="utf-8", newline="\n") as fh:
            json.dump(data, fh, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        written += 1

    tot = [sum(v[i] for v in stats.values()) for i in range(5)]
    print(f"pages {tot[0]} · with places {tot[1]} ({100 * tot[1] / max(1, tot[0]):.1f}%): within {WALK_KM:g} km {tot[4]}, "
          f"{WALK_KM:g}-{AREA_KM:g} km {tot[1] - tot[4]} · own language only {tot[2]} · topped up with English {tot[3]} · "
          f"json files {written}")
    for lang in sorted(stats):
        v = stats[lang]
        print(f"  {lang:6} pages {v[0]:5}  walking {v[4]:5}  area {v[1] - v[4]:5}  none {v[0] - v[1]:4}")
    if suspect:
        print(f"  doubtful coordinates (> {SUSPECT_KM:g} km from their city folder) on {len(suspect)} pages, "
              f"left out: e.g. {suspect[:6]}")
    no_geo = [f"{p['lang']}/{p['city']}/{p['slug']}" for p in pages if not p["geo"]]
    if len(no_geo) > len(suspect):
        print(f"  no usable coordinates on {len(no_geo)} pages in all (incl. the doubtful ones)")


if __name__ == "__main__":
    sys.exit(main())
