#!/usr/bin/env python3
"""Offline SEO pre-deploy checks for lokali.travel's static files (no network).

Usage:
  python3 tools/seo-agent/precheck.py --all [--sample 50] [--seed 7] [--json]
  python3 tools/seo-agent/precheck.py --file public/explore/en/istanbul.html [--file ...]

Exit codes: 0 = no hard failures (warnings may be printed), 1 = hard failure (do not
deploy), 3 = checker error. Hard failures: invalid sitemap XML, sitemap URL whose file
is missing, non-canonical host in a sitemap, noindex on a sitemap page, canonical that
does not point at the page itself, hreflang alternate whose file is missing, invalid
JSON-LD, robots.txt blocking a search-index bot from /explore/ or /, price/hours
wording in a blog page. Everything else is a warning.
"""
import argparse
import json
import os
import random
import re
import sys
import xml.etree.ElementTree as ET
from urllib.parse import unquote, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
PUBLIC = os.path.join(ROOT, "public")
CANONICAL_HOSTS = {"lokali.travel"}
ACCEPTED_HOSTS = {"lokali.travel", "www.lokali.travel"}
SEARCH_BOTS = ["Googlebot", "Bingbot", "OAI-SearchBot", "Claude-SearchBot", "PerplexityBot", "Applebot"]
SM_NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
XHTML_NS = "{http://www.w3.org/1999/xhtml}"

FORBIDDEN_BLOG = [
    (r"[$€₺₾£]\s?\d", "price with a currency symbol"),
    (r"\b\d+[.,]?\d*\s?(USD|EUR|TRY|GEL|GBP|TL)\b", "price with a currency code"),
    (r"\b(free entry|free admission|admission fee|entrance fee|ticket price|tickets cost)\b", "fee/price wording"),
    (r"\b(opens? at \d|closes? at \d|closed on (mon|tue|wed|thu|fri|sat|sun))", "opening-hours wording"),
    (r"\b\d{1,2}(:\d{2})?\s?(am|pm)\b", "clock time"),
]

RE_CANONICAL = re.compile(r"<link\b[^>]*\brel=[\"']canonical[\"'][^>]*>", re.I)
RE_HREF = re.compile(r"\bhref=[\"']([^\"']+)[\"']", re.I)
RE_ALTERNATE = re.compile(r"<link\b[^>]*\brel=[\"']alternate[\"'][^>]*>", re.I)
RE_HREFLANG = re.compile(r"\bhreflang=[\"']([^\"']+)[\"']", re.I)
RE_ROBOTS_META = re.compile(r"<meta\b[^>]*\bname=[\"']robots[\"'][^>]*>", re.I)
RE_CONTENT = re.compile(r"\bcontent=[\"']([^\"']*)[\"']", re.I)
RE_JSONLD = re.compile(r"<script\b[^>]*type=[\"']application/ld\+json[\"'][^>]*>(.*?)</script>", re.I | re.S)
RE_TITLE = re.compile(r"<title>(.*?)</title>", re.I | re.S)
RE_H1 = re.compile(r"<h1\b", re.I)
RE_TAGS = re.compile(r"<[^>]+>")


class Report:
    def __init__(self):
        self.hard = []
        self.warn = []
        self.info = {}

    def fail(self, where, msg):
        self.hard.append(f"{where}: {msg}")

    def warning(self, where, msg):
        self.warn.append(f"{where}: {msg}")


def url_to_path(url: str):
    """Map a lokali.travel URL to a file under public/. Returns (path, host_ok)."""
    u = urlparse(url.strip())
    host_ok = u.netloc.lower() in ACCEPTED_HOSTS
    path = unquote(u.path or "/")
    if path.endswith("/"):
        path += "index.html"
    if path == "":
        path = "/index.html"
    return os.path.normpath(os.path.join(PUBLIC, path.lstrip("/"))), host_ok, u


def rel(path: str) -> str:
    return os.path.relpath(path, ROOT).replace(os.sep, "/")


def read_text(path: str) -> str:
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        return fh.read()


def check_page(path: str, rep: Report, in_sitemap: bool, expected_url=None):
    where = rel(path)
    if not os.path.isfile(path):
        rep.fail(where, "file missing")
        return
    html = read_text(path)
    # title / h1
    m = RE_TITLE.search(html)
    if not m or not RE_TAGS.sub("", m.group(1)).strip():
        rep.warning(where, "no <title>")
    if not RE_H1.search(html):
        rep.warning(where, "no <h1>")
    # robots meta
    for tag in RE_ROBOTS_META.findall(html):
        c = RE_CONTENT.search(tag)
        if c and "noindex" in c.group(1).lower():
            (rep.fail if in_sitemap else rep.warning)(where, "meta robots noindex" + (" on a sitemap page" if in_sitemap else ""))
    # canonical
    canon_tags = RE_CANONICAL.findall(html)
    if not canon_tags:
        (rep.fail if in_sitemap else rep.warning)(where, "no canonical link")
    else:
        if len(canon_tags) > 1:
            rep.warning(where, f"{len(canon_tags)} canonical links")
        h = RE_HREF.search(canon_tags[0])
        if not h:
            rep.fail(where, "canonical without href")
        else:
            cpath, host_ok, cu = url_to_path(h.group(1))
            if cu.netloc.lower() not in CANONICAL_HOSTS:
                rep.fail(where, f"canonical host is {cu.netloc!r}, expected lokali.travel")
            if os.path.normpath(cpath) != os.path.normpath(path):
                # allow index.html <-> directory forms
                rep.fail(where, f"canonical points elsewhere: {h.group(1)}")
    # hreflang alternates
    alts = RE_ALTERNATE.findall(html)
    langs = []
    for tag in alts:
        hl = RE_HREFLANG.search(tag)
        if not hl:
            continue
        langs.append(hl.group(1))
        h = RE_HREF.search(tag)
        if not h:
            rep.fail(where, "hreflang link without href")
            continue
        apath, host_ok, au = url_to_path(h.group(1))
        if au.netloc and not host_ok:
            rep.fail(where, f"hreflang href on foreign host: {h.group(1)}")
        elif not os.path.isfile(apath):
            rep.fail(where, f"hreflang {hl.group(1)} → missing file {rel(apath)}")
    if langs and "x-default" not in langs:
        rep.warning(where, "hreflang set without x-default")
    # JSON-LD
    for i, block in enumerate(RE_JSONLD.findall(html)):
        try:
            json.loads(block.strip())
        except Exception as e:
            rep.fail(where, f"JSON-LD block {i + 1} invalid: {e}")
    # forbidden wording (hard for blog, warn elsewhere)
    r = rel(path)
    is_blog = r.startswith("public/blog")
    text = RE_TAGS.sub(" ", html)
    for pat, label in FORBIDDEN_BLOG:
        mm = re.search(pat, text, re.I)
        if mm:
            snippet = text[max(0, mm.start() - 30): mm.end() + 30].replace("\n", " ")
            (rep.fail if is_blog else rep.warning)(where, f"{label}: …{snippet.strip()}…")
            break


def parse_sitemap(path: str, rep: Report):
    """Return (kind, entries). kind: 'index' or 'urlset'. entries: list of dicts."""
    where = rel(path)
    if not os.path.isfile(path):
        rep.fail(where, "sitemap file missing")
        return None, []
    try:
        tree = ET.parse(path)
    except ET.ParseError as e:
        rep.fail(where, f"invalid XML: {e}")
        return None, []
    root = tree.getroot()
    if root.tag == SM_NS + "sitemapindex":
        locs = [s.findtext(SM_NS + "loc") for s in root.findall(SM_NS + "sitemap")]
        return "index", [{"loc": l} for l in locs if l]
    if root.tag == SM_NS + "urlset":
        entries = []
        for u in root.findall(SM_NS + "url"):
            loc = u.findtext(SM_NS + "loc")
            alts = [(x.get("hreflang"), x.get("href")) for x in u.findall(XHTML_NS + "link") if x.get("rel") == "alternate"]
            entries.append({"loc": loc, "alts": alts, "lastmod": u.findtext(SM_NS + "lastmod")})
        return "urlset", entries
    rep.fail(where, f"unexpected root element {root.tag}")
    return None, []


def check_sitemaps(rep: Report, sample: int, seed: int, existence_limit: int = 2000):
    index_path = os.path.join(PUBLIC, "sitemap.xml")
    kind, entries = parse_sitemap(index_path, rep)
    children = []
    if kind == "index":
        for e in entries:
            p, host_ok, u = url_to_path(e["loc"])
            if u.netloc.lower() not in CANONICAL_HOSTS:
                rep.fail(rel(index_path), f"child sitemap on non-canonical host: {e['loc']}")
            children.append(p)
    elif kind == "urlset":
        children = [index_path]
    all_urls = []
    counts = {}
    for child in children:
        kind, entries = parse_sitemap(child, rep)
        if kind != "urlset":
            continue
        counts[rel(child)] = len(entries)
        for e in entries:
            loc = e["loc"] or ""
            if loc.startswith("http://"):
                rep.fail(rel(child), f"http:// URL in sitemap: {loc}")
            p, host_ok, u = url_to_path(loc)
            if u.netloc.lower() not in CANONICAL_HOSTS:
                rep.fail(rel(child), f"URL on non-canonical host: {loc}")
            all_urls.append((child, loc, p, e))
    rep.info["sitemap_counts"] = counts
    rep.info["sitemap_urls_total"] = len(all_urls)
    # language distribution for /explore/
    langs = {}
    for _, loc, _, _ in all_urls:
        m = re.search(r"/explore/([a-z]{2}(?:-[a-z]{2})?)/", loc)
        if m:
            langs[m.group(1)] = langs.get(m.group(1), 0) + 1
    rep.info["explore_urls_by_language"] = dict(sorted(langs.items(), key=lambda kv: -kv[1]))
    # existence check: every URL when the set is small, a random sample on slow/large trees
    rnd = random.Random(seed)
    if len(all_urls) <= existence_limit:
        existence_set = all_urls
        rep.info["existence_checked"] = f"all {len(all_urls)}"
    else:
        existence_set = rnd.sample(all_urls, existence_limit)
        rep.info["existence_checked"] = f"sample {existence_limit} of {len(all_urls)} (raise --existence-limit on a fast filesystem)"
    missing = 0
    missing_examples = []
    for child, loc, p, e in existence_set:
        if not os.path.isfile(p):
            missing += 1
            if len(missing_examples) < 10:
                missing_examples.append(loc)
    if missing:
        rep.fail("sitemaps", f"{missing} of {len(existence_set)} checked sitemap URLs have no file on disk; examples: {missing_examples}")
    # sample deep checks
    picked = rnd.sample(all_urls, min(sample, len(all_urls))) if all_urls else []
    for child, loc, p, e in picked:
        check_page(p, rep, in_sitemap=True, expected_url=loc)
        for hl, href in e.get("alts") or []:
            ap, host_ok, au = url_to_path(href or "")
            if not os.path.isfile(ap):
                rep.fail(rel(child), f"sitemap hreflang {hl} for {loc} → missing file {rel(ap)}")
    rep.info["sampled_urls"] = len(picked)


def check_robots(rep: Report):
    path = os.path.join(PUBLIC, "robots.txt")
    where = rel(path)
    if not os.path.isfile(path):
        rep.fail(where, "robots.txt missing")
        return
    groups = {}
    current = []
    sitemaps = []
    for raw in read_text(path).splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        key, _, val = line.partition(":")
        key = key.strip().lower()
        val = val.strip()
        if key == "user-agent":
            current = [val]
            groups.setdefault(val, [])
        elif key in ("allow", "disallow") and current:
            for ua in current:
                groups[ua].append((key, val))
        elif key == "sitemap":
            sitemaps.append(val)
    if not sitemaps:
        rep.warning(where, "no Sitemap: lines")
    rep.info["robots_groups"] = sorted(groups.keys())
    for bot in SEARCH_BOTS:
        rules = groups.get(bot, groups.get("*", []))
        for key, val in rules:
            if key == "disallow" and val in ("/", "/explore/", "/explore", "/blog/", "/blog.html"):
                rep.fail(where, f"{bot} is disallowed from {val}")


def check_redirects(rep: Report):
    path = os.path.join(PUBLIC, "_redirects")
    if not os.path.isfile(path):
        return
    n = 0
    for i, raw in enumerate(read_text(path).splitlines(), 1):
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        parts = line.split()
        n += 1
        if len(parts) < 2 or len(parts) > 3:
            rep.warning(rel(path), f"line {i}: unexpected format")
        elif len(parts) == 3 and parts[2] not in ("200", "301", "302", "404", "410"):
            rep.warning(rel(path), f"line {i}: unusual status {parts[2]}")
    rep.info["redirect_rules"] = n


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--file", action="append", default=[])
    ap.add_argument("--sample", type=int, default=50)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--existence-limit", type=int, default=2000,
                    help="check file existence for every sitemap URL up to this many; above it, a random sample of this size")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    if not args.all and not args.file:
        ap.print_help()
        return 3
    rep = Report()
    try:
        if args.all:
            check_robots(rep)
            check_sitemaps(rep, args.sample, args.seed, args.existence_limit)
            check_redirects(rep)
        for f in args.file:
            p = f if os.path.isabs(f) else os.path.join(ROOT, f)
            p = os.path.normpath(p)
            name = os.path.basename(p)
            if name == "robots.txt":
                check_robots(rep)
            elif name.startswith("sitemap") and name.endswith(".xml"):
                parse_sitemap(p, rep)
                if name == "sitemap.xml" or name == "sitemap-explore.xml":
                    kind, entries = parse_sitemap(p, rep)
                    if kind == "urlset":
                        missing = [e["loc"] for e in entries if not os.path.isfile(url_to_path(e["loc"] or "")[0])]
                        if missing:
                            rep.fail(rel(p), f"{len(missing)} URLs without a file; examples: {missing[:5]}")
            elif name == "_redirects":
                check_redirects(rep)
            elif p.lower().endswith((".html", ".htm")):
                check_page(p, rep, in_sitemap=False)
            else:
                rep.info.setdefault("skipped", []).append(rel(p))
    except Exception as e:  # checker error must not look like a site failure
        print(f"precheck: checker error: {e}", file=sys.stderr)
        return 3
    out = {"hard_failures": rep.hard, "warnings": rep.warn, "info": rep.info}
    if args.json:
        print(json.dumps(out, ensure_ascii=False, indent=1))
    else:
        for k, v in rep.info.items():
            print(f"[info] {k}: {v}")
        for w in rep.warn[:200]:
            print(f"[warn] {w}")
        for h in rep.hard[:200]:
            print(f"[FAIL] {h}")
        print(f"precheck: {len(rep.hard)} hard failure(s), {len(rep.warn)} warning(s)")
    return 1 if rep.hard else 0


if __name__ == "__main__":
    sys.exit(main())
