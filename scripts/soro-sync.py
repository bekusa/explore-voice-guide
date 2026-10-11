#!/usr/bin/env python3
"""
soro-sync.py — publish Soro articles as real, server-rendered pages.

Soro's own integration is a client-side <script> from app.trysoro.com. Google
can render that; GPTBot, ClaudeBot, OAI-SearchBot and PerplexityBot cannot —
they read the HTML the server returns and never execute JavaScript. Since
lokali.travel is built for AI answer engines (see robots.txt), a JS-only blog
would be invisible to exactly the crawlers we care about.

So we take Soro's RSS feed (enabled via its /api/rss/enable) and render each
published article into public/blog/<slug>.html in the same template as the
hand-built journal articles: full <head>, canonical, hreflang, BlogPosting +
BreadcrumbList schema, hero image, CTA. The widget stays on the noindex
staging page at /blog/live.html so you can see what Soro published before it
is promoted.

    python3 scripts/soro-sync.py            # fetch, render, update index+sitemap
    python3 scripts/soro-sync.py --dry-run  # print the plan, write nothing

Env:
    SORO_RSS      feed URL (default: the lokali.travel feed)
    BLOG_DIR      output dir  (default: ../public/blog)
    SORO_NOINDEX  =1 -> every Soro page gets noindex,nofollow  (kill switch)

Kill switch, two levels:
    1. SORO_NOINDEX=1 && python3 scripts/soro-sync.py   -> noindex every Soro
       page in one run, leaving /explore/ and the 5 hand-built articles alone.
    2. POST https://app.trysoro.com/api/rss/disable      -> stop the feed.

The script owns only the files listed in public/blog/.soro-manifest.json. It
never touches the hand-built articles.
"""

import os, re, sys, json, html, hashlib, unicodedata, urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from xml.etree import ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
BLOG = os.environ.get("BLOG_DIR") or os.path.join(HERE, "..", "public", "blog")
BLOG = os.path.abspath(BLOG)
PUB = os.path.dirname(BLOG)                      # public/
INDEX = os.path.join(PUB, "blog.html")
SITEMAP = os.path.join(PUB, "sitemap-blog.xml")
MANIFEST = os.path.join(BLOG, ".soro-manifest.json")

FEED = os.environ.get(
    "SORO_RSS",
    "https://app.trysoro.com/api/rss/40e3fcd6-ae58-4652-bf7f-5ad9d903f38f",
)
SITE = "https://lokali.travel"
NOINDEX = os.environ.get("SORO_NOINDEX") == "1"
DRY = "--dry-run" in sys.argv

NS = {
    "content": "http://purl.org/rss/1.0/modules/content/",
    "media": "http://search.yahoo.com/mrss/",
    "dc": "http://purl.org/dc/elements/1.1/",
}

FALLBACK_IMG = ("https://lokaliphotos.blob.core.windows.net/attractions/"
                "ca7975ecbafe9cb85647b9e08e054a87fa53a64a.jpg")

MAXTITLE, MAXDESC = 62, 158


# ---------------------------------------------------------------- utilities

def atomic_write(path, text):
    """Temp file + os.replace. A killed run must never leave a half file —
    this project has been bitten by that twice."""
    if DRY:
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(text)
    os.replace(tmp, path)


def slug(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return re.sub(r"-{2,}", "-", s)[:70].strip("-")


def esc(s):
    return html.escape(s or "", quote=True)


def shrink(text, limit):
    """Sentence-aware trim, so a description never ends mid-word."""
    t = re.sub(r"\s+", " ", (text or "")).strip()
    if len(t) <= limit:
        return t
    cut = t[: limit + 1]
    for stop in (". ", "! ", "? ", "; ", ", "):
        i = cut.rfind(stop)
        if i > limit * 0.55:
            return cut[:i].rstrip(" ,;") + ("." if stop.startswith(".") else "")
    i = cut.rfind(" ")
    return (cut[:i] if i > 0 else cut[:limit]).rstrip(" ,;.") + "…"


def fetch(url):
    req = urllib.request.Request(
        url, headers={"User-Agent": "lokali-soro-sync/1.0 (+https://lokali.travel)"}
    )
    with urllib.request.urlopen(req, timeout=45) as r:
        return r.read()


# ------------------------------------------------------------- sanitisation

ALLOWED = {
    "p": (), "br": (), "hr": (),
    "h2": (), "h3": (), "h4": (),
    "strong": (), "b": (), "em": (), "i": (), "u": (), "s": (),
    "ul": (), "ol": (), "li": (),
    "blockquote": (), "code": (), "pre": (),
    "a": ("href", "title", "rel", "target"),
    "img": ("src", "alt", "width", "height", "loading"),
    "figure": (), "figcaption": (),
    "table": (), "thead": (), "tbody": (), "tr": (), "th": (), "td": (),
}
DROP_CONTENT = {"script", "style", "iframe", "object", "embed", "noscript", "svg", "form"}
VOID = {"br", "hr", "img"}


class Sanitiser(HTMLParser):
    """Allowlist sanitiser. Soro's HTML is third-party content going onto our
    domain, so nothing executable survives: no script/style/iframe, no on*
    handlers, no javascript: URLs. h1 is demoted to h2 — the page already has
    one h1."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []
        self.skip = 0
        self.open = []

    def handle_starttag(self, tag, attrs):
        if tag in DROP_CONTENT:
            self.skip += 1
            return
        if self.skip:
            return
        if tag == "h1":
            tag = "h2"
        if tag not in ALLOWED:
            return
        keep = []
        for k, v in attrs:
            k = (k or "").lower()
            if k not in ALLOWED[tag] or not v:
                continue
            if k in ("href", "src"):
                u = v.strip()
                if not re.match(r"^(https?:|/|#|mailto:)", u, re.I):
                    continue
                v = u
            keep.append((k, v))
        d = dict(keep)
        if tag == "a":
            href = d.get("href", "")
            if href.startswith("http") and "lokali.travel" not in href:
                d["rel"] = "nofollow noopener"
                d["target"] = "_blank"
        if tag == "img":
            d.setdefault("loading", "lazy")
            d.setdefault("alt", "")
        a = "".join(f' {k}="{esc(str(v))}"' for k, v in d.items())
        if tag in VOID:
            self.out.append(f"<{tag}{a}>")
        else:
            self.out.append(f"<{tag}{a}>")
            self.open.append(tag)

    def handle_endtag(self, tag):
        if tag in DROP_CONTENT:
            self.skip = max(0, self.skip - 1)
            return
        if self.skip:
            return
        if tag == "h1":
            tag = "h2"
        if tag in VOID or tag not in ALLOWED:
            return
        if tag in self.open:
            while self.open:
                t = self.open.pop()
                self.out.append(f"</{t}>")
                if t == tag:
                    break

    def handle_data(self, data):
        if not self.skip:
            self.out.append(html.escape(data, quote=False))

    def result(self):
        while self.open:
            self.out.append(f"</{self.open.pop()}>")
        h = "".join(self.out)
        h = re.sub(r"<p>\s*</p>", "", h)
        return h.strip()


def clean_html(raw):
    s = Sanitiser()
    s.feed(raw or "")
    s.close()
    return s.result()


def plain(raw, limit=200000):
    t = re.sub(r"<[^>]+>", " ", raw or "")
    t = html.unescape(t)
    return re.sub(r"\s+", " ", t).strip()[:limit]


# -------------------------------------------------------------- feed parsing

def parse_feed(xml_bytes):
    root = ET.fromstring(xml_bytes)
    chan = root.find("channel")
    if chan is None:
        raise SystemExit("soro-sync: feed has no <channel> — aborting, nothing written")
    items = []
    for it in chan.findall("item"):
        def tx(tag, ns=None):
            el = it.find(tag, ns) if ns else it.find(tag)
            return (el.text or "").strip() if el is not None and el.text else ""

        title = tx("title")
        if not title:
            continue
        body_raw = tx("content:encoded", NS) or tx("description")
        link = tx("link")
        # prefer the slug Soro itself chose, so URLs stay stable if the
        # title is later edited
        sl = ""
        m = re.search(r"/([A-Za-z0-9\-_]+)/?$", link or "")
        if m and m.group(1).lower() not in ("blog", "articles"):
            sl = slug(m.group(1))
        sl = sl or slug(title) or hashlib.sha1(title.encode()).hexdigest()[:12]

        img = ""
        mc = it.find("media:content", NS)
        if mc is not None:
            img = mc.get("url") or ""
        if not img:
            enc = it.find("enclosure")
            if enc is not None and (enc.get("type") or "").startswith("image"):
                img = enc.get("url") or ""
        if not img:
            m = re.search(r'<img[^>]+src=["\']([^"\']+)', body_raw or "")
            if m:
                img = m.group(1)

        date = ""
        for cand in (tx("pubDate"), tx("dc:date", NS)):
            if not cand:
                continue
            for fmt in ("%a, %d %b %Y %H:%M:%S %z", "%a, %d %b %Y %H:%M:%S %Z",
                        "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d"):
                try:
                    date = datetime.strptime(cand, fmt).strftime("%Y-%m-%d")
                    break
                except ValueError:
                    continue
            if date:
                break
        date = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")

        cats = [c.text.strip() for c in it.findall("category") if c.text]
        desc = tx("description")

        items.append({
            "title": title,
            "slug": sl,
            "body": clean_html(body_raw),
            "text": plain(body_raw),
            "desc": shrink(plain(desc) or plain(body_raw), MAXDESC),
            "image": img or FALLBACK_IMG,
            "date": date,
            "kicker": (cats[0] if cats else "Journal"),
        })
    return items


# ------------------------------------------------------------------ template

CSS_SRC = os.path.join(BLOG, "self-guided-vs-guided-tours.html")


def shared_css():
    """Reuse the journal stylesheet verbatim so Soro pages are visually
    identical to the hand-built ones."""
    with open(CSS_SRC, encoding="utf-8") as fh:
        src = fh.read()
    m = re.search(r"<style>\n(.*?)\n</style>", src, re.S)
    if not m:
        raise SystemExit("soro-sync: could not lift the journal stylesheet")
    return m.group(1)


FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700'
         '&family=Playfair+Display:ital,wght@0,500;0,600;1,500&display=swap" rel="stylesheet">')


def reading_time(text):
    return max(3, round(len(text.split()) / 220))


def article_html(it, css):
    url = f"{SITE}/blog/{it['slug']}.html"
    t = shrink(it["title"], MAXTITLE - 9)
    full_title = f"{t} | Lokali"
    robots = ("noindex,nofollow" if NOINDEX
              else "index,follow,max-image-preview:large,max-snippet:-1")
    graph = [{
        "@type": "BlogPosting",
        "headline": it["title"],
        "description": it["desc"],
        "url": url,
        "mainEntityOfPage": {"@type": "WebPage", "@id": url},
        "image": it["image"],
        "datePublished": it["date"],
        "dateModified": it["date"],
        "inLanguage": "en",
        "isAccessibleForFree": True,
        "author": {"@type": "Organization", "name": "Lokali", "url": SITE + "/"},
        "publisher": {"@type": "Organization", "name": "Lokali", "url": SITE + "/"},
    }, {
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Lokali", "item": SITE + "/"},
            {"@type": "ListItem", "position": 2, "name": "Journal",
             "item": f"{SITE}/blog.html"},
            {"@type": "ListItem", "position": 3, "name": it["title"], "item": url},
        ],
    }]
    ld = json.dumps({"@context": "https://schema.org", "@graph": graph},
                    ensure_ascii=False, separators=(",", ":"))
    alt = ""
    if not NOINDEX:
        alt = "".join(
            f'<link rel="alternate" hreflang="{h}" href="{url}">'
            for h in ("en-US", "en-GB", "x-default")
        )
    utm = ("https://play.google.com/store/apps/details?id=app.lokali.travel"
           "&amp;utm_source=seo&amp;utm_medium=blog&amp;utm_campaign=en"
           f"&amp;utm_content={esc(it['slug'])}")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#110c08">
<script>if(window.Capacitor){{location.replace("https://lokali.travel/");}}</script>
<title>{esc(full_title)}</title>
<meta name="description" content="{esc(it['desc'])}">
<meta name="robots" content="{robots}">
<link rel="canonical" href="{url}">
{alt}
<meta property="og:type" content="article">
<meta property="og:site_name" content="Lokali">
<meta property="og:locale" content="en">
<meta property="og:title" content="{esc(full_title)}">
<meta property="og:description" content="{esc(it['desc'])}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{esc(it['image'])}">
<meta name="twitter:card" content="summary_large_image">
{FONTS}
<script type="application/ld+json">{ld}</script>
<style>
{css}
</style>
</head>
<body>
<div class="page">
<header class="topbar"><a class="brand" href="{SITE}/">Lokali</a><nav class="navlinks"><a href="{SITE}/blog.html" class="on">Journal</a><a href="{SITE}/explore/en/rome.html">Explore</a></nav></header>
<p class="crumbs"><a href="{SITE}/">Lokali</a> &rsaquo; <a href="{SITE}/blog.html">Journal</a> &rsaquo; {esc(shrink(it['title'], 48))}</p>
<main>
<article>
<span class="kicker">{esc(it['kicker'])}</span>
<h1>{esc(it['title'])}</h1>
<div class="byline"><span>{reading_time(it['text'])} min read</span><span>Published {esc(it['date'])}</span></div>
<div class="hero-img"><img src="{esc(it['image'])}" alt="{esc(shrink(it['title'], 90))}" width="1200" height="675"><span class="ov"></span></div>
<div class="answer"><span class="lb">In short</span><p>{esc(it['desc'])}</p></div>
<div class="prose">
{it['body']}
</div>
<a class="cta" href="{utm}" rel="nofollow" target="_blank"><span class="tx"><b>Free audio guides, 190+ cities</b><span>45 languages, works offline, no ticket and no rental desk.</span></span><span class="go">Get the app</span></a>
</article>
<h2>Keep reading</h2>
<div class="more-list"><a href="{SITE}/blog.html">All journal articles</a><a href="{SITE}/explore/en/rome.html">Rome</a><a href="{SITE}/explore/en/istanbul.html">Istanbul</a><a href="{SITE}/explore/en/tbilisi.html">Tbilisi</a></div>
</main>
<footer>Lokali &mdash; free AI audio guides for travellers, in your own language.<br><a href="{SITE}/">Open Lokali</a> &middot; <a href="{SITE}/blog.html">Journal</a></footer>
</div>
</body>
</html>
"""


def card_html(it):
    """Index card. Keep the <img class="th"> + <span class="tx"> wrapper in
    step with the hand-built cards in blog.html — the index stylesheet lays
    the card out as a flex row and a card without them collapses."""
    url = f"{SITE}/blog/{it['slug']}.html"
    img = (f'<img class="th" src="{esc(it["image"])}" alt="" width="104" '
           f'height="104" loading="lazy" decoding="async">')
    return (f'<a class="card" href="{url}">{img}<span class="tx">'
            f'<span class="kicker">{esc(it["kicker"])}</span>'
            f'<h3>{esc(it["title"])}</h3><p>{esc(it["desc"])}</p>'
            f'<div class="m"><span>{reading_time(it["text"])} min read</span>'
            f'<span>Published {esc(it["date"])}</span></div></span></a>')


# ------------------------------------------------------------- index/sitemap

CARD_RE = re.compile(r'<a class="card" href="([^"]+)">.*?</a>', re.S)


def update_index(items):
    with open(INDEX, encoding="utf-8") as fh:
        src = fh.read()
    m = re.search(r'(<div class="cards">)(.*?)(</div>)\n<h2>', src, re.S)
    if not m:
        raise SystemExit("soro-sync: could not find the card block in blog.html")

    existing = CARD_RE.findall(m.group(2))
    raw_cards = [mm.group(0) for mm in CARD_RE.finditer(m.group(2))]
    by_url = dict(zip(existing, raw_cards))

    soro_urls = {f"{SITE}/blog/{it['slug']}.html" for it in items}
    kept = [(u, c) for u, c in by_url.items() if u not in soro_urls]

    new_cards = ([card_html(it) for it in items] + [c for _, c in kept]) \
        if not NOINDEX else [c for _, c in kept]

    src = src[:m.start(2)] + "".join(new_cards) + src[m.end(2):]

    # ItemList in the page's JSON-LD must match the cards it shows
    order = ([f"{SITE}/blog/{it['slug']}.html" for it in items] if not NOINDEX else []) \
        + [u for u, _ in kept]
    names = {f"{SITE}/blog/{it['slug']}.html": it["title"] for it in items}
    for u, c in kept:
        mm = re.search(r"<h3>(.*?)</h3>", c, re.S)
        names[u] = html.unescape(re.sub(r"<[^>]+>", "", mm.group(1))) if mm else u
    lst = [{"@type": "ListItem", "position": i + 1, "name": names[u], "url": u}
           for i, u in enumerate(order)]
    src = re.sub(
        r'(\{"@type":"ItemList","name":"Lokali Journal","itemListElement":)\[.*?\](\}\])',
        lambda mo: mo.group(1) + json.dumps(lst, ensure_ascii=False,
                                            separators=(",", ":")) + mo.group(2),
        src, count=1, flags=re.S)

    atomic_write(INDEX, src)
    return order


def update_sitemap(order):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    urls = [f"{SITE}/blog.html"] + order
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'
           ' xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for u in urls:
        out.append("  <url>")
        out.append(f"    <loc>{u}</loc>")
        for h in ("en-US", "en-GB", "x-default"):
            out.append(f'    <xhtml:link rel="alternate" hreflang="{h}" href="{u}"/>')
        out.append(f"    <lastmod>{today}</lastmod>")
        out.append("    <changefreq>monthly</changefreq>")
        out.append("  </url>")
    out.append("</urlset>")
    atomic_write(SITEMAP, "\n".join(out) + "\n")


# ---------------------------------------------------------------------- main

def main():
    print(f"soro-sync: feed  {FEED}")
    print(f"soro-sync: out   {BLOG}")
    if NOINDEX:
        print("soro-sync: KILL SWITCH — every Soro page will be noindex,nofollow")
    if DRY:
        print("soro-sync: dry run, nothing will be written")

    items = parse_feed(fetch(FEED))
    if not items:
        print("soro-sync: feed is empty (no published articles) — nothing to do.")
        print("           Soro only puts *published* articles in the feed; drafts")
        print("           and scheduled articles do not appear until they go live.")
        return 0

    # one page per slug; keep the newest if Soro ever repeats one
    seen = {}
    for it in sorted(items, key=lambda x: x["date"], reverse=True):
        seen.setdefault(it["slug"], it)
    items = list(seen.values())

    # Never overwrite a page this script does not own. The hand-built journal
    # articles are far richer than anything the feed carries, and an earlier
    # version of this script replaced a 30 KB hand-written Rome itinerary with
    # a 12 KB generated one. Only slugs recorded in .soro-manifest.json may be
    # rewritten; a collision with anything else is skipped and reported.
    owned = set()
    if os.path.exists(MANIFEST):
        try:
            with open(MANIFEST, encoding="utf-8") as fh:
                owned = {u.rsplit("/", 1)[-1][:-5]
                         for u in json.load(fh).get("pages", [])}
        except (ValueError, OSError):
            owned = set()

    kept_items, skipped = [], []
    for it in items:
        path = os.path.join(BLOG, it["slug"] + ".html")
        if os.path.exists(path) and it["slug"] not in owned:
            skipped.append(it)
        else:
            kept_items.append(it)
    if skipped:
        print("\nsoro-sync: SKIPPED — a hand-built page already owns this slug.")
        print("           Rename or unpublish the article in Soro; nothing was"
              " overwritten.")
        for it in skipped:
            print(f"  {it['slug']}.html  <- {it['title']!r}")
        print()
    items = kept_items
    if not items:
        print("soro-sync: nothing left to publish after the collision check.")
        return 1

    css = shared_css()
    written = []
    for it in items:
        path = os.path.join(BLOG, it["slug"] + ".html")
        page = article_html(it, css)
        if "</html>" not in page[-20:]:
            raise SystemExit(f"soro-sync: {it['slug']} rendered truncated — aborting")
        atomic_write(path, page)
        written.append(f"{SITE}/blog/{it['slug']}.html")
        print(f"  {'[dry] ' if DRY else ''}{it['slug']}.html  "
              f"{len(it['text'].split())} words  {it['date']}")

    order = update_index(items)
    update_sitemap(order)

    # Ownership is cumulative: a page pulled from the feed stays ours even if
    # the article is later unpublished in Soro, so we can still rewrite or
    # retire it. Orphans are reported, never deleted silently.
    all_owned = sorted(set(written) | {f"{SITE}/blog/{s}.html" for s in owned})
    orphans = [u for u in all_owned if u not in written]
    atomic_write(MANIFEST, json.dumps(
        {"generated": datetime.now(timezone.utc).isoformat(),
         "feed": FEED, "noindex": NOINDEX,
         "pages": all_owned, "in_feed": written},
        indent=2) + "\n")
    if orphans:
        print("soro-sync: these pages are ours but no longer in the feed "
              "(unpublished in Soro?) — delete them by hand if that is "
              "intended:")
        for u in orphans:
            print("  " + u)

    print(f"\nsoro-sync: {len(written)} article page(s), index and sitemap updated.")
    print("Next: push, then IndexNow these URLs:")
    for u in written + [f"{SITE}/blog.html"]:
        print("  " + u)
    return 0


if __name__ == "__main__":
    sys.exit(main())
