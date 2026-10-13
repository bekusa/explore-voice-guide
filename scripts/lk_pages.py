"""Re-skin an existing city hub or attraction page into the explore design system.
Content, head, hreflang and schema are kept; only layout and presentation change."""
import json, os, re, sys, html as H
sys.path.insert(0, os.path.dirname(__file__))
from lk_sys import *

ATTR = json.load(open("/tmp/rd/attr.json"))
BY_URL = {a["url"]: a for a in ATTR}
FALLBACK = "images/museums/louvre.jpg"

PUBDIR = sys.argv[1] if len(sys.argv) > 1 else ""
def img_for(url):
    """Photo for a linked page: the scan index first, then the page's own hero on disk
    (alias and noindex pages are not in the index but still have a photo)."""
    a = BY_URL.get(url)
    if a and FALLBACK not in a["img"]: return a["img"]
    if PUBDIR and url.startswith(SITE + "/"):
        p = os.path.join(PUBDIR, url[len(SITE) + 1:])
        try:
            t = open(p, encoding="utf-8", errors="ignore").read(60000)
            m = re.search(r'<div class="hero-img"><img src="([^"]+)"', t) or \
                re.search(r'<meta property="og:image" content="([^"]+)"', t)
            if m and FALLBACK not in m.group(1): return m.group(1)
        except OSError:
            pass
    return ""

def grab(p, s, flags=re.S):
    m = re.search(p, s, flags); return m.group(0) if m else ""
def inner(p, s, flags=re.S):
    m = re.search(p, s, flags); return m.group(1) if m else ""

def new_head(s, og_img, preview):
    head = s[: s.find("</head>")]
    head = re.sub(r"<style>.*?</style>", lambda m: "<style>" + CSS + "</style>", head, count=1, flags=re.S)
    if og_img:
        head = re.sub(r'(<meta property="og:image" content=")[^"]*(")', lambda m: m.group(1) + og_img + m.group(2), head)
    if preview:
        head = re.sub(r'<meta name="robots"[^>]*>', '', head)
        head = head.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="robots" content="noindex,nofollow">', 1)
        head = re.sub(r'<link rel="alternate"[^>]*>', '', head)
        head = head.replace("<title>", "<title>[PREVIEW] ", 1)
    return head + "</head>"

def appbar(s):
    return grab(r'<div class="appbar-cta".*?</script>', s)

def sections_after(s, start_marker):
    """All <section> blocks of the original body, optionally skipping the one holding start_marker."""
    out = []
    for m in re.finditer(r"<section>.*?</section>", s, re.S):
        blk = m.group(0)
        if start_marker and start_marker in blk: continue
        blk = blk.replace('class="tour"', 'class="prose"')
        blk = re.sub(r'<p class="eyebrow">\d+</p>', '', blk)
        blk = re.sub(r'<p class="eyebrow">(.*?)</p>', r'<span class="eyebrow">\1</span>', blk)
        blk = blk.replace('<h2 class="sec">', '<h2 class="sec" style="margin-bottom:16px">')
        out.append(blk)
    return out

def fix_entities(t):
    return t.replace("&amp;middot;", "&middot;").replace("&amp;rsaquo;", "&rsaquo;")

# ---------------------------------------------------------------- city hub
def city(src, dst, slug, pub, preview=True):
    s = open(src, encoding="utf-8").read()
    s = fix_entities(s)
    photo = f"{SITE}/images/cities/{slug}.jpg" if os.path.exists(f"{pub}/images/cities/{slug}.jpg") else ""
    cards = re.findall(r'<a class="hub-card" href="([^"]+)"><span class="hc-head"><b>(.*?)</b><span class="km">(.*?)</span></span>'
                       r'<p class="mp-brief">(.*?)</p><span class="mp-meta">(.*?)</span></a>', s, re.S)
    if not photo:
        for u, *_ in cards:
            photo = img_for(u)
            if photo: break
    name = H.unescape(inner(r"<h1>(.*?)</h1>", s))
    geo = inner(r'<p class="geoline">(.*?)</p>', s)
    answer = inner(r'<p class="answer">(.*?)</p>', s)
    tag = re.split(r"(?<=\.)\s", H.unescape(answer), 1)[0]
    verified = grab(r'<p class="verified">.*?</p>', s)
    stats = grab(r'<div class="stats">.*?</div></div>', s)
    n = len(cards)

    grid = []
    for i, (u, nm, dur, brief, typ) in enumerate(cards):
        img = img_for(u) or photo
        grid.append(icard(u, img, H.unescape(nm), f"{dur} &middot; {typ}", brief=H.unescape(brief),
                          rank=f"#{i+1}" if i < 3 else None))
    CEYE = {"Planning your time": "Plan your visit", "Common questions": "Questions"}
    rest = []
    for blk in sections_after(s, 'class="hub-list"'):
        t = H.unescape(re.sub(r"<[^>]+>", "", inner(r'<h2 class="sec"[^>]*>(.*?)</h2>', blk))).strip()
        rest.append(blk.replace('<h2 class="sec"', f'<span class="eyebrow" style="margin-top:48px">{CEYE.get(t, "More")}</span><h2 class="sec"', 1))

    body = f'''<body>
{topbar(lang_dd=grab(r'<details class="lang-dd">.*?</details>', s))}
<main class="wrap">
{grab(r'<nav class="crumbs".*?</nav>', s)}
<section class="hero">
<img src="{esc(photo)}" alt="{esc(name)}" fetchpriority="high" decoding="async"><span class="ov"></span>
<div class="hero-copy">
<span class="badge">{n} free audio guides</span>
<h1>{esc(name)}</h1>
<p class="tag">{geo}</p>
<div class="btns"><a class="btn gold" href="{PLAY.format(c="city-"+slug)}" rel="nofollow" target="_blank"><span class="pl">&#9654;</span>Listen free in the app</a>
<a class="btn ghost" href="#places">See all {n} places &darr;</a></div>
</div>
</section>
{stats}
<p class="lead">{answer}</p>
{verified}

<section id="places">
<div class="shead"><div><span class="eyebrow">{n} free guides</span><h2>What to see in <em>{esc(name)}</em></h2><p>Every place below has a free audio guide in 45 languages</p></div></div>
<div class="grid">{"".join(grid)}</div>
</section>

<div class="narrow" style="margin:0 auto">
{"".join(rest)}
</div>

{apppanel(photo, "city-"+slug, heading=f"Walk {esc(name)} <em>with a guide in your ear</em>",
          body=f"All {n} guides for {esc(name)}, free, offline and in your language. Download them before you land.")}
{FOOTER}
</main>
{appbar(s)}
</body>
</html>
'''
    doc = new_head(s, photo, preview) + "\n" + body
    open(dst, "w", encoding="utf-8").write(doc)
    return doc

# ---------------------------------------------------------------- attraction
def attraction(src, dst, pub, preview=True):
    s = open(src, encoding="utf-8").read()
    s = fix_entities(s)
    img = inner(r'<div class="hero-img"><img src="([^"]+)"', s)
    name = H.unescape(inner(r"<h1>(.*?)</h1>", s))
    badge = inner(r'<span class="badge">(.*?)</span>', s) or "Free audio guide"
    geo = inner(r'<p class="geoline">(.*?)</p>', s)
    answer = inner(r'<p class="answer">(.*?)</p>', s)
    verified = grab(r'<p class="verified">.*?</p>', s)
    crumbs = grab(r'<nav class="crumbs".*?</nav>', s)
    city_link = re.findall(r'<a href="([^"]+)">([^<]+)</a>', crumbs)
    city_url, city_name = (city_link[-1] if city_link else (f"{SITE}/explore/index.html", "Explore"))
    canon = inner(r'<link rel="canonical" href="([^"]+)"', s)
    slug = canon.rsplit("/", 1)[-1][:-5]

    # nearby -> photo rail
    near = re.findall(r'<a href="([^"]+)">([^<]+)<span class="km">([^<]+)</span></a>',
                      inner(r'<div class="nearby">(.*?)</div>', s))
    rail = "".join(pcard(u, img_for(u) or img, H.unescape(n), f"{km} away", eager=True)
                   for u, n, km in near)

    EYE = {"Visitor facts": "At a glance", "The story": "The guide", "Key facts": "Good to know",
           "What to look for": "Look closer", "Practical tips": "Before you go",
           "Common questions": "Questions", "On the map": "Location"}
    secs = []
    for blk in sections_after(s, None):
        if 'class="nearby"' in blk: continue
        if 'class="eyebrow"' not in blk:
            t = H.unescape(re.sub(r"<[^>]+>", "", inner(r'<h2 class="sec"[^>]*>(.*?)</h2>', blk))).strip()
            blk = blk.replace("<h2 class=\"sec\"", f'<span class="eyebrow" style="margin-top:48px">{EYE.get(t, "More")}</span><h2 class="sec"', 1)
        secs.append(blk)

    body = f'''<body>
{topbar(lang_dd=grab(r'<details class="lang-dd">.*?</details>', s))}
<main class="wrap">
{crumbs}
<section class="hero">
<img src="{esc(img)}" alt="{esc(name)}, {esc(city_name)}" fetchpriority="high" decoding="async"><span class="ov"></span>
<div class="hero-copy">
<span class="badge">{badge}</span>
<h1>{esc(name)}</h1>
<p class="geo">{geo}</p>
<div class="btns"><a class="btn gold" href="{PLAY.format(c="attr-"+slug)}" rel="nofollow" target="_blank"><span class="pl">&#9654;</span>Listen free in the app</a>
<a class="btn ghost" href="{esc(city_url)}">More in {esc(city_name)} &rarr;</a></div>
</div>
</section>

<div class="narrow" style="margin:0 auto">
<p class="lead">{answer}</p>
{verified}
{"".join(secs)}
</div>

{f'<section><div class="shead"><div><span class="eyebrow">Nearby</span><h2>More to see in <em>{esc(city_name)}</em></h2><p>Free audio guides a short walk away</p></div><a class="seeall" href="{esc(city_url)}">All of {esc(city_name)} &rarr;</a></div><div class="rail">{rail}</div></section>' if rail else ""}

{apppanel(img, "attr-"+slug, heading=f"Hear {esc(name)} <em>in your language</em>",
          body="The full story, narrated, in 45 languages. Download it before you go and it plays offline, at your own pace, with no ticket and no tour group.")}
{FOOTER}
</main>
{appbar(s)}
</body>
</html>
'''
    doc = new_head(s, None, preview) + "\n" + body
    open(dst, "w", encoding="utf-8").write(doc)
    return doc

if __name__ == "__main__":
    pub = sys.argv[1]
    ex = f"{pub}/explore"
    d1 = city(f"{ex}/en/istanbul.html", f"{ex}/preview-istanbul.html", "istanbul", pub)
    d2 = attraction(f"{ex}/en/istanbul/hagia-sophia.html", f"{ex}/preview-hagia.html", pub)
    for nm, d in (("city", d1), ("attraction", d2)):
        imgs = re.findall(r'<img src="([^"]+)"', d)
        print(nm, len(d), "bytes | img", len(imgs), "unique", len(set(imgs)),
              "| empty img", sum(1 for i in imgs if not i), "| tail", d.rstrip()[-7:])
