# -*- coding: utf-8 -*-
"""English /explore/ attraction pages from content-factory guides (wave 1, 2026-10-30).

Input (FACTORY_DATA dir, not in the repo): items.json built by the wave's prep step:
one record per guide with the cached_guides payload (title, script, key_facts,
look_for, tips, estimated_duration_seconds) plus Wikidata facts (coordinates,
description, country ISO, enwiki title, official site) and the Commons photo with
its author and licence.

Nothing here writes prose about a place. Every sentence about the place is either
the factory guide (script, key facts, look-for, tips) or its Wikidata description;
the generator only adds the frame around them (where it is, how long the guide
runs, that it is free in 50+ languages).

Usage:
  FACTORY_DATA=/path/to/w1 python3 gen_factory_en.py <stage-dir>
writes <stage-dir>/en/<city>/<slug>.html + <slug>/index.html, and plan.json
(city hubs and country hubs the pages expect; built by gen_factory_hubs.py).
"""
import json, os, re, sys, math, html, collections

W = os.environ.get("FACTORY_DATA", "/sessions/affectionate-awesome-planck/mnt/outputs/w1")
STAGE = sys.argv[1]
BASE = "https://lokali.travel"
EDIT = BASE + "/about/editorial-process.html"
MONTH = os.environ.get("PUB_MONTH", "October 2026")

I = json.load(open(f"{W}/items.json"))
EXI = json.load(open(f"{W}/exist_img.json"))      # existing EN pages near wave-1 items: img, h1, geo
HUBS = json.load(open(f"{W}/hubs_plan.json"))     # {"city": {slug: {...}}, "country": {name: slug}}

esc = lambda s: html.escape(s or "", quote=True)
txt = lambda s: html.escape(s or "", quote=False)
NL = "\n"


def km(a, b):
    return math.hypot((a[1] - b[1]) * 111 * math.cos(math.radians(a[0])), (a[0] - b[0]) * 111)


def mins(s):
    return max(1, round((s or 0) / 60))


def bc(s):
    """'432 before Christ' -> '432 BC' (the scripts are written for speech)."""
    s = re.sub(r"(\d)\s+before Christ\b", r"\1 BC", s or "")
    return re.sub(r"(\d)\s+(?:after Christ|Anno Domini)\b", r"\1 AD", s)


def sent(s):
    s = bc(s).strip()
    if not s:
        return s
    s = s[0].upper() + s[1:]
    return s if s[-1] in ".!?" else s + "."


# ---------------------------------------------------------------- lead sentence
LOWER_OK = set("""indoor outdoor former historic historical ancient medieval modern public private royal national natural
artificial holy sacred large small big great major main old new famous large-scale ruined fortified protected listed
monument museum castle palace church cathedral temple mosque bridge tower park garden gardens zoo theatre theater
house building fort fortress statue memorial cemetery square street district island mountain lake river waterfall
cave canyon valley beach museum archaeological amusement theme art city town village site complex structure
residence shrine abbey monastery convent chapel basilica observatory aquarium stadium arena hall library market
opera concert music science history military naval heritage tourist sculpture clock lighthouse railway road canal
dam tomb mausoleum pyramid necropolis catacomb citadel wall gate arch obelisk column fountain pagoda stupa
hill rock volcano glacier forest reserve wildlife marine botanical observation skyscraper office hotel""".split())
for a in I:
    w = (a["desc"] or "").split(" ")[0]
    if w and w[0].islower():
        LOWER_OK.add(w)
SING_S = {"campus", "bus", "canvas", "series", "species", "colossus", "circus", "fortress", "headquarters",
          "barracks", "corpus", "apparatus", "status", "oasis", "acropolis", "necropolis", "metropolis",
          "thermopylae", "complex", "press", "cross", "terminus", "gas", "ibis"}
BOUND = {"in", "of", "on", "at", "from", "near", "located", "built", "and", "with", "for", "by", "between",
         "within", "dedicated", "that", "which", "designed", "founded", "used", "named", "beginning", "crossing",
         "containing", "now", "formerly", "above", "under", "over", "outside", "inside", "along", "across"}


def fix_desc(d):
    d = (d or "").strip().rstrip(".")
    if not d or d.lower().startswith("wikimedia"):
        return ""
    d = re.sub(r"^(?:a|an)\s+", "", d)
    d = d.replace("People's Republic of China", "China").replace("United States of America", "United States")
    ws = d.split(" ")
    f = ws[0]
    second_cap = len(ws) > 1 and ws[1][:1].isupper()
    if f[:1].isupper() and not f.isupper() and not second_cap and f.lower() in LOWER_OK:
        d = f.lower() + d[len(f):]
    return d


def plural(d):
    head = []
    for w in re.findall(r"[A-Za-z][A-Za-z\-']*|,", d):
        if w == "," or w.lower() in BOUND:
            break
        head.append(w)
    if not head:
        return False
    w = head[-1].lower()
    return w.endswith("s") and not w.endswith(("ss", "us", "is", "ous")) and w not in SING_S


SUPER = re.compile(r"^(?:\w+est|first|second|third|last|only|main|largest|oldest|tallest|longest|biggest|highest|most|best)\b", re.I)


def article(d):
    f = d.split(" ")[0]
    fl = f.lower()
    if SUPER.match(d):
        return "the"
    if f[:1].isupper() and re.search(r"^(?:\S+\s){0,3}\S+'s\s", d):
        return ""
    if fl in ("one", "the") or fl.startswith(("one-", "the ")) or d.lower().startswith(("one of", "part of", "any of")):
        return ""
    m = re.match(r"\d+", f)
    if m:
        n = m.group()
        return "an" if n.startswith("8") or n in ("11", "18") or (len(n) == 4 and n[:2] in ("11", "18")) else "a"
    if f.isupper() and len(f) <= 5 and f.isalpha():
        if f in ("UNESCO", "US", "USA", "UK", "UAE"):
            return "a"
        return "an" if f[0] in "AEFHILMNORSX" else "a"
    if fl.startswith(("uni", "use", "usu", "uti", "eu", "ure", "uro", "u.s.", "one")):
        return "a"
    if fl.startswith(("hour", "honor", "honour", "heir")):
        return "an"
    return "an" if fl[:1] in "aeiou" else "a"


def where(a):
    return a["country"] if a["city_disp"] == a["country"] or not a["city_disp"] else f'{a["city_disp"]}, {a["country"]}'


def prep(a):
    """'in' when the page sits in a real city hub or the name/description says so;
    otherwise 'near' - the factory city is the nearest town the app files it under."""
    c = (a["city_disp"] or "").lower()
    return "in" if a["how"] != "own" or (c and c in (a["desc"] + " " + a["title"]).lower()) else "near"


HAS_LOC = re.compile(r"\b(?:in|of|near|on|at)\s+(?:the\s+)?[A-Z]")


def lead(a, short=False):
    t = a["title"]
    d = "" if short else fix_desc(a["desc"])
    cat = a["cat"]
    P = []
    if d:
        if plural(d):
            P.append(f"{t} are {d}.")
        else:
            ar = article(d)
            P.append(f"{t} is {ar + ' ' if ar else ''}{d}.")
        if a["city_disp"].lower() not in d.lower() and (a["how"] != "own" or not HAS_LOC.search(d)):
            P.append(f"It is {prep(a)} {where(a)}.")
    else:
        P.append(f"{t} is {article(cat)} {cat} {prep(a)} {where(a)}.")
    if a["key_facts"]:
        P.append(sent(a["key_facts"][0]))
    P.append(f"The free Lokali audio guide runs {mins(a['dur'])} minutes.")
    return " ".join(P)


_ABBR = re.compile(r"(?:^|[\s\u2013\-])(?:[A-Z]|St|Mt|Ft|Dr|Mr|Mrs|Jr|Sr|No|ca|c|vs|etc)\.$", re.UNICODE)


def shrink(d, limit=158):
    """Same rule as gen.py: whole sentences, keep the Lokali line if it fits."""
    if len(d) <= limit:
        return d
    parts = re.split(r"(?<=[.!?])\s+", d.strip())
    S = []
    for x in parts:
        if S and _ABBR.search(S[-1]):
            S[-1] += " " + x
        else:
            S.append(x)

    def fill(seq, lim):
        k = ""
        for x in seq:
            c = (k + " " + x).strip()
            if len(c) <= lim:
                k = c
            else:
                break
        return k

    hook = S[-1] if len(S) > 1 and "Lokali" in S[-1] else None
    if hook:
        k = fill(S[:-1], limit - len(hook) - 1)
        if k:
            return k + " " + hook
    k = fill(S, limit)
    return k or d[: limit - 1].rsplit(" ", 1)[0].rstrip(",;:—- ") + "…"


def page_title(a):
    t, c = a["title"], a["city_disp"]
    for x in ([f"{t}, {c} — Free Audio Guide | Lokali"] if c and c.lower() not in t.lower() else []) + [
            f"{t} — Free Audio Guide | Lokali", f"{t} — Lokali"]:
        if len(x) <= 62:
            return x
    return t[:52].rstrip() + "… — Lokali"


# ---------------------------------------------------------------- FAQ
BEST = re.compile(r"\b(early|morning|sunset|sunrise|evening|dusk|dawn|crowds?|weekdays?|season|spring|summer|autumn|winter|opening|late afternoon)\b", re.I)


def faq(a):
    t = a["title"]
    m = mins(a["dur"])
    F = [(f"Is there a free audio guide to {t}?",
          f"Yes — the Lokali app narrates {t} free of charge in 50+ languages. The guide runs about {m} minutes, "
          f"covers the history, what to look for on site and practical tips, and works offline once downloaded."),
         (f"Where is {t}?",
          f"{t} is {prep(a)} {where(a)}, at {a['lat']:.4f}, {a['lng']:.4f}. Tap the map link on this page for directions from where you are.")]
    kf = a["key_facts"]
    if kf:
        F.append((f"What is {t} known for?", " ".join(sent(x) for x in kf[:2])))
    lf = a["look_for"]
    if lf:
        F.append((f"What should you look for at {t}?", " ".join(sent(x) for x in lf[:3])))
    tips = a["tips"]
    used = set()
    if tips:
        F.append((f"What should you know before visiting {t}?", " ".join(sent(x) for x in tips[:2])))
        used = set(tips[:2])
    best = next((x for x in tips if BEST.search(x) and x not in used), None) or next((x for x in tips if BEST.search(x)), None)
    if best:
        F.append((f"When is the best time to visit {t}?", sent(best)))
    return F


# ---------------------------------------------------------------- markup
SVG = {
    "facts": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
    "look": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    "tips": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
}
MAPSVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M16.2 7.8l-2.9 6.4-6.4 2.9 2.9-6.4z"/></svg>'
FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' + NL +
         '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,500;0,600;1,500&display=swap" rel="stylesheet">')
TOPBAR = ('<header class="topbar"><div class="wrap"><a class="brand" href="https://lokali.travel/">Lokali</a><nav class="nav">'
          '<a href="https://lokali.travel/explore/index.html" class="on">Explore</a><a href="https://lokali.travel/blog.html">Journal</a></nav>'
          '<div class="tb-right"><a class="getapp" href="https://play.google.com/store/apps/details?id=app.lokali.travel&amp;utm_source=seo&amp;utm_medium=explore&amp;utm_campaign=topbar-en" rel="nofollow" target="_blank">Get the app</a></div></div></header>')


def appbar(content):
    return ('<div class="appbar-cta" id="gpb"><div class="pill"><a href="https://play.google.com/store/apps/details?id=app.lokali.travel&amp;utm_source=seo&amp;utm_medium=explore&amp;utm_campaign=en&amp;utm_content='
            + esc(content) + '" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 48 48" width="24" height="24" style="flex-shrink:0"><path d="M24,24 L12,35 L12,13 Z" fill="#00B0FF"/><path d="M24,24 L36,35 L36,13 Z" fill="#00E676"/><path d="M24,24 L12,13 L24,3 Z" fill="#FFC400"/><path d="M24,24 L36,13 L24,3 Z" fill="#FF3D57"/></svg><span class="lb"><small>Google Play</small><b>Get the app</b></span></a><button class="x" aria-label="Dismiss" onclick="try{localStorage.setItem(\'lokali.playbanner.dismissed.v1\',\'1\')}catch(e){};document.getElementById(\'gpb\').classList.remove(\'show\')">&#10005;</button></div></div><script>(function(){var d=false;try{d=localStorage.getItem("lokali.playbanner.dismissed.v1")==="1"}catch(e){}if(!window.Capacitor&&!d){document.getElementById("gpb").classList.add("show")}})();</script>')


def sec(eyebrow, h2, inner):
    return (f'<section>{NL}<span class="eyebrow" style="margin-top:48px">{eyebrow}</span><h2 class="sec" style="margin-bottom:16px">{h2}</h2>{NL}'
            f'{inner}{NL}</section>')


def pcard(url, img, name, meta):
    return (f'<a class="pcard" href="{esc(url)}"><img src="{esc(img)}" alt="{esc(name)}" loading="lazy" decoding="async" width="500" height="625">'
            f'<span class="cov"></span><span class="meta"><b>{txt(name)}</b><small>{meta}</small></span></a>')


def wiki_url(t):
    from urllib.parse import quote
    return "https://en.wikipedia.org/wiki/" + quote(t.replace(" ", "_"), safe="()_,'-.:!")


def type_label(cat):
    return " ".join(w if w.isupper() else w[:1].upper() + w[1:] for w in (cat or "").split())


def nearby(a, pool):
    me = (a["lat"], a["lng"])
    c = []
    for p in pool:
        if p["url"] == a["url"] or not p["img"]:
            continue
        if abs(p["geo"][0] - me[0]) > 0.5:
            continue
        d = km(me, p["geo"])
        if d <= 50:
            c.append((d, p))
    c.sort(key=lambda x: x[0])
    out, seen = [], set()
    for d, p in c:
        k = re.sub(r"[^a-z]", "", p["name"].lower())[:10]
        if k in seen:
            continue
        seen.add(k)
        out.append((d, p))
        if len(out) == 4:
            break
    return out


BADWEB = re.compile(r"unesco\.org|wikipedia\.|wikimedia\.|wikidata\.|facebook\.|twitter\.|x\.com/|instagram\.|google\.|youtube\.", re.I)


def page(a, pool):
    if a.get("web") and BADWEB.search(a["web"]):
        a = dict(a, web=None)          # not an official site (UNESCO listing, social profile...)
    t = a["title"]
    url = f'{BASE}/explore/en/{a["city"]}/{a["slug"]}.html'
    hub = HUBS["city"].get(a["city"])
    hub_url = f'{BASE}/explore/en/{a["city"]}.html' if hub else None
    cslug = HUBS["country"].get(a["country"])
    c_url = f"{BASE}/explore/en/country/{cslug}.html" if cslug else None
    L_ = lead(a)
    desc = shrink(L_)
    if "Lokali" not in desc:
        desc = shrink(lead(a, short=True))
    F = faq(a)
    ttl = page_title(a)
    typ = type_label(a["cat"])
    m = mins(a["dur"])

    ta = {"@type": "TouristAttraction", "@id": url + "#attraction", "name": t}
    if a["wname"] and a["wname"] != t:
        ta["alternateName"] = a["wname"]
    ta.update({"description": L_, "url": url, "inLanguage": "en"})
    if a["img"]:
        ta["image"] = a["img"]
    ta["geo"] = {"@type": "GeoCoordinates", "latitude": a["lat"], "longitude": a["lng"]}
    ta["hasMap"] = f"https://www.google.com/maps/search/?api=1&query={a['lat']:.4f}%2C{a['lng']:.4f}"
    addr = {"@type": "PostalAddress", "addressLocality": a["city_disp"] or a["country"]}
    if a["cc"]:
        addr["addressCountry"] = a["cc"]
    ta["address"] = addr
    if typ:
        ta["additionalType"] = typ
    same = []
    if a["enwiki"]:
        same.append(wiki_url(a["enwiki"]))
    same.append(f"https://www.wikidata.org/wiki/{a['q']}")
    if a.get("web"):
        same.append(a["web"])
    ta["sameAs"] = same
    cr = [{"@type": "ListItem", "position": 1, "name": "Lokali", "item": BASE},
          {"@type": "ListItem", "position": 2, "name": "Explore", "item": f"{BASE}/explore/index.html"}]
    if c_url:
        cr.append({"@type": "ListItem", "position": len(cr) + 1, "name": a["country"], "item": c_url})
    if hub_url:
        cr.append({"@type": "ListItem", "position": len(cr) + 1, "name": hub["name"], "item": hub_url})
    cr.append({"@type": "ListItem", "position": len(cr) + 1, "name": t, "item": url})
    g = {"@context": "https://schema.org", "@graph": [ta, {"@type": "BreadcrumbList", "itemListElement": cr},
         {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": x}} for q, x in F]}]}

    H = ['<!DOCTYPE html>', '<html lang="en" dir="ltr">', '<head>', '<meta name="lk-design" content="1">', '<meta charset="utf-8">',
         '<meta name="viewport" content="width=device-width, initial-scale=1">', '<meta name="theme-color" content="#110c08">',
         f'<title>{txt(ttl)}</title>', f'<meta name="description" content="{esc(desc)}">', f'<link rel="canonical" href="{url}">',
         '<meta property="og:type" content="article">', '<meta property="og:site_name" content="Lokali">', '<meta property="og:locale" content="en">',
         f'<meta property="og:title" content="{esc(ttl)}">', f'<meta property="og:description" content="{esc(desc)}">',
         f'<meta property="og:url" content="{url}">']
    if a["img"]:
        H.append(f'<meta property="og:image" content="{esc(a["img"])}">')
    H += ['<meta name="twitter:card" content="summary_large_image">', FONTS, '<script type="application/ld+json">',
          json.dumps(g, ensure_ascii=False), '</script>', '<link rel="stylesheet" href="/explore/assets/lk-1.css">', '</head>', '<body>', TOPBAR,
          '<main class="wrap">']
    crumbs = [f'<a href="{BASE}">Lokali</a>', f'<a href="{BASE}/explore/index.html">Explore</a>']
    if c_url:
        crumbs.append(f'<a href="{c_url}">{txt(a["country"])}</a>')
    if hub_url:
        crumbs.append(f'<a href="{hub_url}">{txt(hub["name"])}</a>')
    crumbs.append(f'<span>{txt(t)}</span>')
    H.append('<nav class="crumbs" aria-label="Breadcrumb">' + ' <span class="sep">&rsaquo;</span> '.join(crumbs) + '</nav>')
    geo = f"{abs(a['lat']):.4f}&deg; {'N' if a['lat'] >= 0 else 'S'} &middot; {abs(a['lng']):.4f}&deg; {'E' if a['lng'] >= 0 else 'W'}"
    if typ:
        geo += f" &middot; {txt(typ)}"
    ghost = (f'<a class="btn ghost" href="{hub_url}">{txt(hub["name"])} &rarr;</a>' if hub_url else
             f'<a class="btn ghost" href="{c_url}">{txt(a["country"])} &rarr;</a>' if c_url else "")
    copy = (f'<div class="hero-copy"><span class="badge">Free audio guide</span><h1>{txt(t)}</h1><p class="geo">{geo}</p><div class="btns">'
            f'<a class="btn gold" href="https://lokali.travel" rel="nofollow" target="_blank"><span class="pl">&#9654;</span>Open the Lokali app</a>{ghost}</div></div>')
    if a["img"]:
        H.append(f'<section class="hero"><img src="{esc(a["img"])}" alt="{esc(t)}" fetchpriority="high" decoding="async"><span class="ov"></span>{copy}</section>')
        cdt = a["credit"]
        who = txt(cdt["artist"]) if cdt["artist"] else "Wikimedia Commons contributor"
        lic = f' &middot; {txt(cdt["lic"])}' if cdt["lic"] else ""
        H.append(f'<p class="credit">Photo: <a href="{esc(cdt["page"])}" rel="nofollow noopener" target="_blank">{who}</a>{lic} &middot; Wikimedia Commons</p>')
    else:
        H.append(f'<section class="hero noimg"><span class="ov"></span>{copy}</section>')
    H.append('<div class="narrow" style="margin:0 auto">')
    H.append(f'<p class="lead">{txt(L_)}</p>')
    H.append(f'<p class="verified">&#10003; <b>Published {MONTH}</b> &middot; <a href="{EDIT}">how we write these guides</a></p>')
    rows = [("Lokali audio guide", f"{m} min &middot; free")]
    if typ:
        rows.append(("Type", txt(typ)))
    rows.append(("Location", txt(where(a))))
    rows.append(("Coordinates", f'<span translate="no">{a["lat"]:.4f}, {a["lng"]:.4f}</span>'))
    if a.get("web"):
        dom = re.sub(r"^https?://(www\.)?", "", a["web"]).split("/")[0]
        rows.append(("Official website", f'<a href="{esc(a["web"])}" rel="nofollow noopener" target="_blank">{txt(dom)}</a>'))
    rows.append(("Languages", "50+, in the Lokali app"))
    H.append(sec("At a glance", "Visitor facts", '<table class="facts-tbl"><tbody>' + NL +
                 NL.join(f"<tr><th>{k}</th><td>{v}</td></tr>" for k, v in rows) + NL + "</tbody></table>"))
    paras = [bc(x.strip()) for x in re.split(r"\n\s*\n", a["script"]) if x.strip()]
    H.append(sec("The guide", "The story", '<div class="prose">' + NL + NL.join(f"<p>{txt(x)}</p>" for x in paras) + NL + "</div>"))
    for cls, eb, h2, its in (("facts", "Good to know", "Key facts", a["key_facts"]), ("look", "Look closer", "What to look for", a["look_for"]),
                             ("tips", "Before you go", "Practical tips", a["tips"])):
        if its:
            H.append(sec(eb, h2, f'<div class="chips {cls}">' + NL + NL.join(
                f'<div class="item">{SVG[cls]}<span>{txt(sent(x))}</span></div>' for x in its) + NL + "</div>"))
    H.append(sec("Questions", "Common questions", '<div class="faq">' + NL + NL.join(
        f"<h3>{txt(q)}</h3>{NL}<p>{txt(x)}</p>" for q, x in F) + NL + "</div>"))
    H.append(sec("Location", "On the map",
                 f'<div class="mapcard"><a href="https://www.google.com/maps/search/?api=1&amp;query={a["lat"]:.4f}%2C{a["lng"]:.4f}" target="_blank" rel="noopener noreferrer">'
                 f'<span class="ic">{MAPSVG}</span>Open in Google Maps<span class="arr">&rsaquo;</span></a></div>{NL}'
                 f'<p class="map-note">Opens directions to {txt(t)} from your location.</p>'))
    H.append("</div>")
    nb = nearby(dict(a, url=url), pool)
    if nb:
        h2 = f"More to see in {txt(hub['name'])}" if hub else f"More to see near {txt(t)}"
        see = f'<a class="seeall" href="{hub_url}">{txt(hub["name"])} &rarr;</a>' if hub_url else ""
        H.append(f'<section><div class="shead"><div><span class="eyebrow">Nearby</span><h2>{h2}</h2></div>{see}</div><div class="rail">'
                 + "".join(pcard(p["url"], p["img"], p["name"], f"{d:.1f} km") for d, p in nb) + "</div></section>")
    ap_img = f'<div class="ap-img"><img src="{esc(a["img"])}" alt="" loading="lazy" decoding="async"></div>' if a["img"] else ""
    H.append(f'<section class="apppanel"><div class="ap-copy"><span class="eyebrow">Free &middot; 50+ languages &middot; offline</span>'
             f'<h3>Hear {txt(t)} <em>in your language</em></h3><p>The full story, narrated, in 50+ languages. Download it before you go and it plays offline, '
             f'at your own pace, with no ticket and no tour group.</p><div class="btns"><a class="btn gold" href="https://lokali.travel" rel="nofollow" target="_blank">'
             f'<span class="pl">&#9654;</span>Get the Lokali app</a><a class="btn ghost" href="https://lokali.travel/">Try it in the browser</a></div></div>{ap_img}</section>')
    foot = [f'<a href="{BASE}/explore/index.html">All cities</a>']
    if c_url:
        foot.append(f'<a href="{c_url}">Audio guides in {txt(a["country"])}</a>')
    if hub_url:
        foot.append(f'<a href="{hub_url}">{txt(hub["name"])}</a>')
    foot.append(f'<a href="{EDIT}">Editorial process</a>')
    H += ["<footer>", " &middot; ".join(foot), "</footer>", "</main>", appbar(a["city"]), "", "</body>", "</html>"]
    return NL.join(H), {"url": url, "title": ttl, "desc": desc, "words": len(" ".join(paras).split()), "nearby": len(nb)}


def wr(rel, h):
    for p in (os.path.join(STAGE, rel), os.path.join(STAGE, rel[:-5], "index.html")):
        os.makedirs(os.path.dirname(p), exist_ok=True)
        tmp = p + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            fh.write(h)
        os.replace(tmp, p)


if __name__ == "__main__":
    pool = [{"url": f'{BASE}/explore/en/{a["city"]}/{a["slug"]}.html', "img": a["card"], "name": a["title"], "geo": (a["lat"], a["lng"])} for a in I]
    pool += [{"url": f"{BASE}/explore/{k}", "img": v["img"], "name": v["h1"], "geo": tuple(v["geo"])} for k, v in EXI.items() if v.get("img")]
    report = []
    for a in I:
        h, r = page(a, pool)
        wr(f'en/{a["city"]}/{a["slug"]}.html', h)
        report.append(r)
    json.dump(report, open(os.path.join(STAGE, "report.json"), "w"), ensure_ascii=False, indent=0)
    print("pages", len(report))
