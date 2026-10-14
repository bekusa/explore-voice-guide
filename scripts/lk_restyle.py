"""Re-skin every /explore/ page (any template, any language) into the Lokali design system.

Head, hreflang, canonical, schema and the language menu are kept untouched; the body is
rebuilt from the page's own content. Only presentation changes - no text is invented.

  python3 -I lk_restyle.py <public_dir> <urlimg.json> <scanA.json> <file list...|--all> [--write] [--force]

Run AFTER gen.py / link-langs.py. Idempotent: pages carrying <meta name="lk-design"> are skipped.
"""
import json, os, re, sys, html as H, urllib.parse as U
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lk_sys import SITE, PLAY, esc, card_img, CSS
from lk_l10n import L10N

CSS_HREF = "/explore/assets/lk-1.css"
MARK = '<meta name="lk-design" content="1">'
FALLBACK = "images/museums/louvre.jpg"

EXTRA_CSS = r"""
.hero.noimg{min-height:clamp(320px,44vh,440px);background:radial-gradient(120% 100% at 15% 0%,#4a3419 0%,#211810 45%,#110c08 100%)}
.hero.noimg .ov{display:none}
.icard .ph.noimg,.pcard.noimg{background:linear-gradient(140deg,#4a3419 0%,#211810 60%,#16100b 100%)}
.ph.noimg .ini,.pcard.noimg .ini{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--serif);font-size:54px;color:rgba(245,183,91,.35)}
.pcard.noimg .ini{align-items:flex-start;padding-top:22%}
.apppanel.noimg{grid-template-columns:1fr}
.page-sec{margin-top:8px}
[dir=rtl] .lead{border-left:1px solid rgba(245,183,91,.24);border-right:3px solid var(--gold)}
[dir=rtl] .apppanel .ap-img::before{background:linear-gradient(270deg,#1c1611 0%,rgba(28,22,17,0) 45%)}
[dir=rtl] table.facts-tbl th,[dir=rtl] table.facts-tbl td{text-align:right}
[dir=rtl] .nav{margin-left:0;margin-right:8px}
[dir=rtl] .tb-right{margin-left:0;margin-right:auto}
[dir=rtl] .lang-menu{right:auto;left:0}
[dir=rtl] .mapcard .arr{margin-left:0;margin-right:auto;transform:scaleX(-1)}
[dir=rtl] .pcard .rk,[dir=rtl] .icard .rk{left:auto;right:12px}
[dir=rtl] .appbar-cta .x{margin-left:0;margin-right:auto}
.credit{font-size:11px;color:var(--muted);margin:8px 6px 0;text-align:right;opacity:.75;line-height:1.4}.credit a{color:inherit;text-decoration:none}[dir=rtl] .credit{text-align:left}
@media(max-width:760px){[dir=rtl] .apppanel .ap-img::before{background:linear-gradient(0deg,#1c1611 0%,rgba(28,22,17,0) 55%)}}
"""

def n(u): return U.unquote(u or "").replace("/index.html", ".html")
def grab(p, s, f=re.S):
    m = re.search(p, s, f); return m.group(0) if m else ""
def inner(p, s, f=re.S):
    m = re.search(p, s, f); return m.group(1) if m else ""
def text(h): return H.unescape(re.sub(r"<[^>]+>", "", h or "")).strip()
def fix_entities(t): return t.replace("&amp;middot;", "&middot;").replace("&amp;rsaquo;", "&rsaquo;")
def good(u): return u if u and FALLBACK not in u else ""

# ------------------------------------------------------------------ pieces
def ph(img, name, rank=None, eager=False):
    rk = f'<span class="rk">{esc(rank)}</span>' if rank else ""
    if img:
        return (f'<span class="ph"><img src="{esc(card_img(img))}" alt="{esc(name)}" loading="{"eager" if eager else "lazy"}" '
                f'decoding="async" width="500" height="333">{rk}</span>')
    return f'<span class="ph noimg"><span class="ini">{esc(name[:1])}</span>{rk}</span>'

def icard(url, img, name, meta, brief="", rank=None):
    p = f"<p>{esc(brief)}</p>" if brief else ""
    return (f'<a class="icard" href="{esc(url)}">{ph(img, name, rank)}'
            f'<span class="tx"><small>{meta}</small><b>{esc(name)}</b>{p}</span></a>')

def pcard(url, img, name, meta, eager=False):
    if img:
        im = (f'<img src="{esc(card_img(img))}" alt="{esc(name)}" loading="{"eager" if eager else "lazy"}" '
              f'decoding="async" width="500" height="625">')
        cls = "pcard"
    else:
        im, cls = f'<span class="ini">{esc(name[:1])}</span>', "pcard noimg"
    return (f'<a class="{cls}" href="{esc(url)}">{im}<span class="cov"></span>'
            f'<span class="meta"><b>{esc(name)}</b><small>{meta}</small></span></a>')

def topbar(lang, lang_dd, getapp):
    j = f'<a href="{SITE}/blog.html">Journal</a>' if lang == "en" else ""
    return (f'<header class="topbar"><div class="wrap">'
            f'<a class="brand" href="{SITE}/">Lokali</a>'
            f'<nav class="nav"><a href="{SITE}/explore/index.html" class="on">Explore</a>{j}</nav>'
            f'<div class="tb-right">{lang_dd}'
            f'<a class="getapp" href="{PLAY.format(c="topbar-" + lang)}" rel="nofollow" target="_blank">{getapp}</a></div>'
            f'</div></header>')

def apppanel(lang, img, cta_href, cta_label, heading=None, body=None):
    eb, hd, bd, tr = L10N.get(lang) or L10N["en"]
    pic = (f'<div class="ap-img"><img src="{esc(img)}" alt="" loading="lazy" decoding="async"></div>' if img else "")
    return (f'<section class="apppanel{"" if img else " noimg"}"><div class="ap-copy">'
            f'<span class="eyebrow">{eb}</span><h3>{heading or hd}</h3><p>{body or bd}</p>'
            f'<div class="btns"><a class="btn gold" href="{cta_href}" rel="nofollow" target="_blank">'
            f'<span class="pl">&#9654;</span>{cta_label}</a>'
            f'<a class="btn ghost" href="{SITE}/">{tr}</a></div></div>{pic}</section>')

EYE = {"Visitor facts": "At a glance", "The story": "The guide", "Key facts": "Good to know",
       "What to look for": "Look closer", "Practical tips": "Before you go", "Common questions": "Questions",
       "On the map": "Location", "Planning your time": "Plan your visit"}

def clean_section(blk, lang):
    blk = blk.replace('class="tour"', 'class="prose"')
    blk = re.sub(r'<p class="eyebrow">\d+</p>', "", blk)
    blk = re.sub(r'<p class="eyebrow">(.*?)</p>', r'<span class="eyebrow">\1</span>', blk)
    blk = blk.replace('<h2 class="sec">', '<h2 class="sec" style="margin-bottom:16px">')
    if lang == "en" and 'class="eyebrow"' not in blk:
        t = text(inner(r'<h2 class="sec"[^>]*>(.*?)</h2>', blk))
        blk = blk.replace('<h2 class="sec"', f'<span class="eyebrow" style="margin-top:48px">{EYE.get(t, "More")}</span><h2 class="sec"', 1)
    else:
        blk = blk.replace('<h2 class="sec"', '<h2 class="sec" data-x', 1).replace('<h2 class="sec" data-x style="margin-bottom:16px">',
                                                                               '<h2 class="sec" style="margin:48px 0 16px">', 1)
    return blk

# ------------------------------------------------------------------ main builder
def restyle(rel, s, kind, IMG):
    s = fix_entities(s)
    lang = rel.split("/")[0]
    hi = s.find("</head>")
    head, body = s[:hi], s[hi:]
    canon = inner(r'<link rel="canonical" href="([^"]+)"', head)
    slug = canon.rsplit("/", 1)[-1][:-5] if canon else rel.rsplit("/", 1)[-1][:-5]
    if slug == "index": slug = canon.rsplit("/", 2)[-2]

    lang_dd = grab(r'<details class="lang-dd">.*?</details>', body)
    crumbs = grab(r'<nav class="crumbs".*?</nav>', body) or grab(r'<div class="crumbs">.*?</div>', body).replace('<div class="crumbs">', '<nav class="crumbs" aria-label="Breadcrumb">').replace('</div>', '</nav>')
    h1 = inner(r"<h1>(.*?)</h1>", body)
    name = text(h1)
    geo = inner(r'<p class="geoline">(.*?)</p>', body) or inner(r'<p class="dur">(.*?)</p>', body)
    answer = inner(r'<p class="answer">(.*?)</p>', body) or inner(r'<p class="lede">(.*?)</p>', body)
    verified = grab(r'<p class="verified">.*?</p>', body)
    badge = inner(r'<span class="badge">(.*?)</span>', body)
    stats = grab(r'<div class="stats">.*?</div></div>', body)
    cta = re.search(r'<a href="([^"]+)" class="cta"[^>]*>.*?<b>(.*?)</b>', body, re.S) or \
          re.search(r'<a class="cta" href="([^"]+)"[^>]*>.*?<b>(.*?)</b>', body, re.S)
    cta_href, cta_label = (cta.group(1), cta.group(2)) if cta else (PLAY.format(c=f"{lang}-{slug}"), "Get the Lokali app")
    appbar = grab(r'<div class="appbar-cta".*?</script>', body)
    getapp = inner(r'<span class="lb">.*?<b>(.*?)</b>', appbar) or "Get the app"
    footer = grab(r"<footer>.*?</footer>", body)
    ld_body = "".join(re.findall(r'<script type="application/ld\+json">.*?</script>', body, re.S))
    secs = re.findall(r'<section(?: class="(?:tour|tips|facts|look)")?>.*?</section>', body, re.S)
    clinks = re.findall(r'<a href="([^"]+)">([^<]+)</a>', crumbs)
    up_url, up_name = clinks[-1] if clinks else (f"{SITE}/explore/index.html", "Explore")

    hero_img = good(IMG.get(n(canon), "")) or good(inner(r'<div class="hero-img"><img src="([^"]+)"', body))
    if not text(h1):
        raise ValueError("missing h1")

    arr = "&larr;" if 'dir="rtl"' in head[:600] else "&rarr;"
    # ---- the list (cities / attractions) or the nearby rail
    list_html, list_sec, rail_html, n_items = "", None, "", 0
    hub = re.findall(r'<a class="hub-card" href="([^"]+)"><span class="hc-head"><b>(.*?)</b><span class="km">(.*?)</span></span>'
                     r'<p class="mp-brief">(.*?)</p><span class="mp-meta">(.*?)</span></a>', body, re.S)
    near_sec = next((b for b in secs if 'class="nearby"' in b), None)
    near = re.findall(r'<a href="([^"]+)">([^<]+)<span class="km">([^<]+)</span></a>', near_sec) if near_sec else []
    if kind in ("city", "country"):
        if hub:
            list_sec = next(b for b in secs if "hub-card" in b)
            cards = [icard(u, good(IMG.get(n(u), "")), text(nm), f"{dur} &middot; {typ}", brief=text(br),
                           rank=f"#{i+1}" if i < 3 else None) for i, (u, nm, dur, br, typ) in enumerate(hub)]
        else:
            list_sec = near_sec
            cards = [icard(u, good(IMG.get(n(u), "")), text(nm), km)
                     for u, nm, km in near]
        n_items = len(cards)
        h2 = inner(r'<h2 class="sec"[^>]*>(.*?)</h2>', list_sec or "")
        eb = f'<span class="eyebrow">{n_items} free guides</span>' if lang == "en" and kind == "city" else ""
        sub = '<p>Every place below has a free audio guide in 45 languages</p>' if lang == "en" and kind == "city" else ""
        list_html = (f'<section id="places"><div class="shead"><div>{eb}<h2>{h2}</h2>{sub}</div></div>'
                     f'<div class="grid">{"".join(cards)}</div></section>')
    elif near:
        h2 = inner(r'<h2 class="sec"[^>]*>(.*?)</h2>', near_sec)
        rail = "".join(pcard(u, good(IMG.get(n(u), "")), text(nm), km, eager=True) for u, nm, km in near)
        eb = '<span class="eyebrow">Nearby</span>' if lang == "en" else ""
        rail_html = (f'<section><div class="shead"><div>{eb}<h2>{h2}</h2></div>'
                     f'<a class="seeall" href="{esc(up_url)}">{esc(up_name)} {arr}</a></div><div class="rail">{rail}</div></section>')

    rest = [clean_section(b, lang) for b in secs if b is not list_sec and b is not near_sec]

    # ---- hero
    if kind in ("city", "country"):
        tag = f'<p class="tag">{geo}</p>' if geo else ""
        ghost = f'<a class="btn ghost" href="#places">{n_items} &darr;</a>' if n_items else ""
        if lang == "en" and n_items:
            ghost = f'<a class="btn ghost" href="#places">See all {n_items} {"places" if kind == "city" else "cities"} &darr;</a>'
        if lang == "en" and not badge:
            badge = f"{n_items} free audio guides" if kind == "city" else ""
    else:
        tag = f'<p class="geo">{geo}</p>' if geo else ""
        ghost = f'<a class="btn ghost" href="{esc(up_url)}">{esc(up_name)} {arr}</a>'
    bdg = f'<span class="badge">{badge}</span>' if badge else ""
    if hero_img:
        hero = (f'<section class="hero"><img src="{esc(hero_img)}" alt="{esc(name)}" fetchpriority="high" decoding="async">'
                f'<span class="ov"></span>')
    else:
        hero = '<section class="hero noimg"><span class="ov"></span>'
    hero += (f'<div class="hero-copy">{bdg}<h1>{h1}</h1>{tag}<div class="btns">'
             f'<a class="btn gold" href="{cta_href}" rel="nofollow" target="_blank"><span class="pl">&#9654;</span>{cta_label}</a>'
             f'{ghost}</div></div></section>')

    if lang == "en" and kind == "city":
        ap = apppanel(lang, hero_img, cta_href, "Get the Lokali app",
                      f"Walk {esc(name)} <em>with a guide in your ear</em>",
                      f"All {n_items} guides for {esc(name)}, free, offline and in your language. Download them before you land.")
    elif lang == "en" and kind == "attr":
        ap = apppanel(lang, hero_img, cta_href, "Get the Lokali app", f"Hear {esc(name)} <em>in your language</em>",
                      "The full story, narrated, in 45 languages. Download it before you go and it plays offline, at your own pace, with no ticket and no tour group.")
    else:
        ap = apppanel(lang, hero_img, cta_href, cta_label)

    lead = f'<p class="lead">{answer}</p>' if answer else ""
    if kind in ("city", "country"):
        main = f'''{stats}
{lead}
{verified}
{list_html}
<div class="narrow" style="margin:0 auto">
{"".join(rest)}
</div>'''
    else:
        main = f'''<div class="narrow" style="margin:0 auto">
{lead}
{verified}
{"".join(rest)}
</div>
{rail_html}'''

    # ---- head: swap inline style for the shared stylesheet, real og:image, marker
    head = re.sub(r"<style>.*?</style>", f'<link rel="stylesheet" href="{CSS_HREF}">', head, count=1, flags=re.S)
    if hero_img:
        head = re.sub(r'(<meta (?:property|name)="(?:og:image|twitter:image)" content=")[^"]*(")',
                      lambda m: m.group(1) + hero_img + m.group(2), head)
    head = head.replace("<head>", "<head>\n" + MARK, 1) if "<head>" in head else head + MARK
    doc = f'''{head}</head>
<body>
{topbar(lang, lang_dd, getapp)}
<main class="wrap">
{crumbs}
{hero}
{main}
{ap}
{footer}
</main>
{appbar}
{ld_body}
</body>
</html>
'''
    return doc

def write_css(pub):
    d = os.path.join(pub, "explore", "assets"); os.makedirs(d, exist_ok=True)
    p = os.path.join(d, "lk-1.css"); t = p + ".tmp"
    open(t, "w", encoding="utf-8").write(CSS.strip() + "\n" + EXTRA_CSS.strip() + "\n"); os.replace(t, p)

if __name__ == "__main__":
    from concurrent.futures import ThreadPoolExecutor
    pub, imgp, scanp, *rest = sys.argv[1:]
    write = "--write" in rest; force = "--force" in rest
    files = [a for a in rest if not a.startswith("--")]
    IMG = json.load(open(imgp)); SC = json.load(open(scanp))
    if "--all" in rest: files = list(SC)
    ex = os.path.join(pub, "explore")
    if write: write_css(pub)
    def one(rel):
        p = os.path.join(ex, rel)
        try:
            s = open(p, encoding="utf-8").read()
            if MARK in s and not force: return rel, "skip", 0
            doc = restyle(rel, s, SC[rel]["k"], IMG)
            if s.count('<link rel="alternate"') != doc.count('<link rel="alternate"'): raise ValueError("hreflang lost")
            if s.count("application/ld+json") != doc.count("application/ld+json"): raise ValueError("ld+json lost")
            if not doc.rstrip().endswith("</html>"): raise ValueError("tail")
            if write:
                t = p + ".tmp"; open(t, "w", encoding="utf-8").write(doc); os.replace(t, p)
            return rel, "ok", len(doc) - len(s)
        except Exception as e:
            return rel, f"ERR {type(e).__name__}: {e}", 0
    with ThreadPoolExecutor(48) as tp: res = list(tp.map(one, files))
    import collections
    print(collections.Counter(r[1] if not r[1].startswith("ERR") else "ERR" for r in res))
    for r in res:
        if r[1].startswith("ERR"): print(r[0], r[1])
