# -*- coding: utf-8 -*-
"""'Listen' buttons on /explore/ and the Journal (Beka 2026-11-10, central since 2026-11-12).

Three things, each in ONE place, so ~28,000 pages never need hand work again:

  look     public/explore/assets/lk-listen.css   (variant B: dark pill, gold ▶, moving sound waves)
  words    LK_LISTEN_TEXT in public/explore/assets/lk-sheet.js   (47 languages, page language)
  links    lk-sheet.js fixStoreLinks()   (iPhone -> App Store, Android -> Play, else lokali.travel/app)

This script only writes the markup those two files act on, and the same words for search engines
(it reads LK_LISTEN_TEXT, so the HTML and the live text cannot drift apart):

  top bar        <a class="getapp" …><span class="pl">▶</span>Listen in app</a>
  big button     <a class="btn gold play" … data-kind data-min data-n data-name>
                   <span class="pl">▶</span><span class="bt"><b>Listen to this guide</b>
                   <small>Free · 9 min · in the Lokali app</small></span></a>
  Journal        <span class="go lkl"><span class="pl">▶</span>Listen in app</span>, same in #lk-install
  every page     <link rel="stylesheet" href="/explore/assets/lk-listen.css">

data-min is the page's own "Lokali audio guide" fact (in the page language), data-n / data-name the
English hubs' own count and h1; nothing is invented. A bare "Play" was rejected on purpose: the button
opens a store, so it says "in the app". Links, rel/target are kept, so lk-sheet.js still sends each
visitor to their store. Idempotent: old buttons and already-converted ones are both rebuilt.

Every generator passes its HTML through apply() / apply_blog() before writing.
One-time pass over the existing tree (the mount is slow, so it works in slices):
  python scripts/lk_listen.py list <listfile>
  python scripts/lk_listen.py run <listfile> <start> <end> [--dry-run]
  python scripts/lk_listen.py blog [--dry-run]
"""
import html as H, json, os, re, sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(os.path.dirname(HERE), "public")
EXP = os.path.join(PUB, "explore")
SHEET = os.path.join(EXP, "assets", "lk-sheet.js")

PLAY = "&#9654;&#xFE0E;"  # U+FE0E: text-style triangle, not the iOS emoji
SEP = " &middot; "
LINK = '<link rel="stylesheet" href="/explore/assets/lk-listen.css">'
LK1 = '<link rel="stylesheet" href="/explore/assets/lk-1.css">'


def _load_text():
    s = open(SHEET, encoding="utf-8").read()
    m = re.search(r"var LK_LISTEN_TEXT = (\{.*?\});\s*// LISTEN-TEXT-END", s, re.S)
    if not m:
        raise SystemExit("lk_listen: LK_LISTEN_TEXT not found in lk-sheet.js")
    return json.loads(m.group(1))


T = _load_text()
E = T["en"]


def _L(lang):
    lang = lang.lower()
    return T.get(lang) or T.get({"zh-hans": "zh-cn", "zh-hant": "zh-tw"}.get(lang, "")) or T.get(lang.split("-")[0]) or E


def where(rel):
    """(lang, kind) from a path under public/explore/; folder twins count as their page."""
    p = rel.replace("\\", "/").strip("/").split("/")
    if p == ["index.html"]:
        return "en", "index"
    if p[-1] == "index.html" and len(p) >= 3:
        p = p[:-2] + [p[-2] + ".html"]
    if len(p) == 2:
        return p[0], "city"
    if len(p) == 3:
        return p[0], ("country" if p[1] == "country" else "attraction")
    return (p[0] if p else "en"), None


GETAPP = re.compile(r'<a class="getapp"([^>]*)>(?:<span class="pl">[^<]*</span>)?[^<]*</a>')
BTN = re.compile(r'<a class="btn gold(?: play)?"([^>]*)><span class="pl">&#9654;(?:&#xFE0E;)?</span>'
                 r'(?:<span class="bt">.*?</span>|[^<]*)</a>', re.S)
DATA = re.compile(r'\s+data-(?:kind|min|n|name)="[^"]*"')
FACT = re.compile(r'<tr><th>[^<]*Lokali[^<]*</th><td>\s*([^<&]*?\d[^<&]*?)\s*&middot;')
H1 = re.compile(r'<section class="hero[^"]*">.*?<h1[^>]*>(.*?)</h1>', re.S)
PLACES = re.compile(r'<a class="btn ghost" href="#places">[^<]*?(\d+)')
BADGE = re.compile(r'<span class="badge">(\d+) free audio guides</span>')
OLD_CSS = re.compile(r'/\* Listen buttons \(lk_listen\.py, 2026-11-10\) \*/.*?\[dir=rtl\] \.btn\.play\{[^}]*\}\n?', re.S)


def words(lang, kind, mins=None, n=0, name=None):
    """(title, [sub parts]) -- the same rule as listenText() in lk-sheet.js."""
    L = _L(lang)
    k = lambda key: L.get(key, E.get(key))
    title = k("guide") if kind == "attraction" else k("guides")
    sub = [k("free")]
    if kind == "attraction" and mins:
        sub.append(mins)
    if kind in ("city", "country") and name:
        tt = L.get("cityTitle" if kind == "city" else "countryTitle")
        if tt:
            title = tt.replace("{name}", name)
        cnt = (L.get("place1") if n == 1 else L.get("places")) if kind == "city" else \
              (L.get("guide1") if n == 1 else L.get("guidesN"))
        if tt and n and cnt:
            sub.append(cnt.replace("{n}", str(n)))
    if kind == "index":
        sub.append(k("langs"))
    sub.append(k("inapp"))
    return title, sub


def apply(html, rel):
    """New pages and the one-time pass both go through here. Idempotent."""
    lang, kind = where(rel)
    if kind is None or not (GETAPP.search(html) or BTN.search(html)):
        return html
    L = _L(lang)
    html = GETAPP.sub(lambda m: f'<a class="getapp"{m.group(1)}><span class="pl">{PLAY}</span>{H.escape(L.get("app", E["app"]), quote=False)}</a>', html)
    if BTN.search(html):
        f = FACT.search(html) if kind == "attraction" else None
        mins = f.group(1).strip() if f else None
        name, n = None, 0
        if kind in ("city", "country"):
            h = H1.search(html)
            name = H.unescape(re.sub(r"<[^>]+>", "", h.group(1))).strip() if h else None
            c = (PLACES.search(html) if kind == "city" else None) or BADGE.search(html)
            n = int(c.group(1)) if c else 0
        title, sub = words(lang, kind, H.unescape(mins) if mins else None, n, name)
        data = f' data-kind="{kind}"'
        if mins:
            data += f' data-min="{H.escape(H.unescape(mins))}"'
        # no data-n: counts are not shown on location pages any more (lk_post.py, 2026-11-13)
        if name:
            data += f' data-name="{H.escape(name)}"'
        tx = H.escape(title, quote=False)
        sx = SEP.join(H.escape(x, quote=False) for x in sub)
        html = BTN.sub(lambda m: f'<a class="btn gold play"{DATA.sub("", m.group(1))}{data}><span class="pl">{PLAY}</span>'
                                 f'<span class="bt"><b>{tx}</b><small>{sx}</small></span></a>', html)
    html = OLD_CSS.sub("", html)  # the 2026-11-10 inline copy (explore index) gives way to the shared file
    if LINK not in html:
        if LK1 in html:
            html = html.replace(LK1, LK1 + "\n" + LINK, 1)
        elif "</head>" in html:
            html = html.replace("</head>", LINK + "\n</head>", 1)
    return html


BLOG_GO = re.compile(r'<span class="go(?: lkl)?">(?:<span class="pl">[^<]*</span>)?(?:&#9654;(?:&#xFE0E;)? )?(?:Get the app|Listen in app)</span>')
BLOG_BAR = re.compile(r'(<div id="lk-install"[^>]*>.*?)<a (?:class="lkl" )?([^>]*)>(?:<span class="pl">[^<]*</span>)?(?:&#9654;(?:&#xFE0E;)? )?(?:Get the app|Listen in app)</a>', re.S)


def apply_blog(html):
    """The Journal is English. Same pill (.lkl) and the same stylesheet as /explore/."""
    app = H.escape(E["app"], quote=False)
    html = BLOG_GO.sub(f'<span class="go lkl"><span class="pl">{PLAY}</span>{app}</span>', html)
    html = BLOG_BAR.sub(lambda m: f'{m.group(1)}<a class="lkl" {m.group(2)}><span class="pl">{PLAY}</span>{app}</a>', html)
    if LINK not in html and "lkl" in html and "</head>" in html:
        html = html.replace("</head>", LINK + "\n</head>", 1)
    return html


# ------------------------------------------------------------------ CLI
def _rd(p):
    with open(p, encoding="utf-8", newline="") as fh:
        return fh.read()


def _wr(p, s):
    t = p + ".tmp"
    with open(t, "w", encoding="utf-8", newline="") as fh:
        fh.write(s)
    os.replace(t, p)


if __name__ == "__main__":
    a = sys.argv[1:]
    dry = "--dry-run" in a
    if a and a[0] == "list":
        out = []
        for root, dirs, files in os.walk(EXP):
            dirs[:] = [d for d in dirs if d != "assets"]
            out += [os.path.relpath(os.path.join(root, f), EXP).replace(os.sep, "/") for f in files if f.endswith(".html")]
        json.dump(sorted(out), open(a[1], "w", encoding="utf-8"), ensure_ascii=False)
        print(len(out), "pages listed")
    elif a and a[0] == "run":
        rels = json.load(open(a[1], encoding="utf-8"))[int(a[2]):int(a[3])]
        stats = {"changed": 0, "buttons": 0, "getapp": 0, "with_min": 0, "linked": 0, "no_button": 0}

        def one(rel):
            p = os.path.join(EXP, rel)
            s = _rd(p)
            n = apply(s, rel)
            if n != s and not dry:
                _wr(p, n)
            return {"changed": n != s, "buttons": n.count('class="btn gold play"'), "getapp": n.count('<a class="getapp"'),
                    "with_min": 'data-min="' in n, "linked": LINK in n, "no_button": not BTN.search(n) and not GETAPP.search(n)}
        with ThreadPoolExecutor(16) as ex:
            res = list(ex.map(one, rels))
        for r in res:
            for k in stats:
                stats[k] += int(r[k]) if isinstance(r[k], bool) else r[k]
        print(json.dumps(stats), "| slice", a[2], a[3], "| DRY" if dry else "| written")
    elif a and a[0] == "blog":
        paths = [os.path.join(PUB, "blog.html")] + [os.path.join(PUB, "blog", f) for f in sorted(os.listdir(os.path.join(PUB, "blog"))) if f.endswith(".html")]
        ch = 0
        for p in paths:
            s = _rd(p)
            n = apply_blog(s)
            if n != s:
                ch += 1
                if not dry:
                    _wr(p, n)
        print(f"blog pages: {len(paths)}, changed: {ch}", "| DRY" if dry else "| written")
    else:
        print(__doc__)
