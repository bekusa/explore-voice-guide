# -*- coding: utf-8 -*-
"""City and country hubs for a content-factory wave (EN), 2026-10-30.

Run after gen_factory_en.py, with the same FACTORY_DATA and stage dir:
  FACTORY_DATA=... python3 gen_factory_hubs.py <public/explore> <stage-dir>

* City hubs: every hub the new pages point at. A hub that already exists is
  rebuilt from its own cards plus the new ones; its <head> hreflang block, the
  language menu in the top bar, its hero photo and any "Planning your time"
  section are carried over unchanged. A new hub is made for a city with 3+ new
  guides.
* Country hubs: rebuilt the same way from the existing city list (counts
  refreshed), plus a "More places" list for pages that have no city hub. A new
  country hub is made for a country with 3+ new pages.
* Hubs with fewer than 3 guides stay noindex.

Every sentence is assembled from counts, names, types and distances; no prose is
written about the city itself.
"""
import json, os, re, sys, math, html, collections, itertools

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_factory_en as G  # noqa: E402  (reuses helpers; its __main__ does not run)

EXP = sys.argv[1]
STAGE = sys.argv[2]
W = G.W
BASE = G.BASE
MONTH = G.MONTH
esc, txt, NL = G.esc, G.txt, G.NL
I = G.I
PLAN = G.HUBS
META = json.load(open(os.environ.get("CM_META", "/sessions/affectionate-awesome-planck/mnt/outputs/cm/meta.json")))
RANK = {r[0]: i for i, r in enumerate(json.load(open(f"{W}/wave1.json")))}
HAS_PLANNING = re.compile(r'<section>\s*<span class="eyebrow"[^>]*>Plan your visit</span>.*?</section>', re.S)


def rd(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def plural(w, n):
    w = w.lower()
    if n == 1:
        return w
    last = w.split(" ")[-1]
    if re.search(r"[^aeiou]y$", last):
        p = last[:-1] + "ies"
    elif re.search(r"(s|x|ch|sh)$", last):
        p = last + "es"
    else:
        p = last + "s"
    return " ".join(w.split(" ")[:-1] + [p])


def andlist(xs):
    xs = list(xs)
    return xs[0] if len(xs) == 1 else ", ".join(xs[:-1]) + " and " + xs[-1]


def span_km(geos):
    g = [x for x in geos if x]
    if len(g) < 2:
        return None
    return max(G.km(a, b) for a, b in itertools.combinations(g, 2))


def dist_sentence(d):
    if d is None or d > 150:
        return ""
    if d < 3:
        return f"The furthest two sit {d:.1f} km apart, close enough to walk between them."
    if d < 60:
        return f"The furthest two sit {round(d)} km apart, so plan on public transport between the far ends."
    return f"The furthest two sit {round(d)} km apart, so treat the outlying ones as separate day trips."


def brief(a):
    d = G.fix_desc(a["desc"])
    if not d:
        return ""
    d = d[0].upper() + d[1:]
    if len(d) > 120:
        d = d[:118].rsplit(" ", 1)[0].rstrip(",;:") + "…"
    return d if d.endswith(("…", ".")) else d + "."


def icard(url, img, name, small, br, rank):
    ph = (f'<img src="{esc(img)}" alt="{esc(name)}" loading="lazy" decoding="async" width="500" height="333">' if img else "")
    return (f'<a class="icard" href="{esc(url)}"><span class="ph">{ph}<span class="rk">#{rank}</span></span><span class="tx">'
            f'<small>{small}</small><b>{txt(name)}</b><p>{txt(br)}</p></span></a>')


def head_block(old, title, desc, url, img, g, noindex, og_type="website"):
    alts = re.findall(r'<link rel="alternate" hreflang="[^"]+" href="[^"]+">', old) if old else []
    theme = re.search(r"<script>\(function\(\)\{var t=null;try\{t=localStorage.getItem\('lokali.theme'\).*?</script>", old or "", re.S)
    H = ['<!DOCTYPE html>', '<html lang="en" dir="ltr">', '<head>', '<meta name="lk-design" content="1">', '<meta charset="utf-8">',
         '<meta name="viewport" content="width=device-width, initial-scale=1">', '<meta name="theme-color" content="#110c08">',
         f'<title>{txt(title)}</title>', f'<meta name="description" content="{esc(desc)}">']
    if noindex:
        H.append('<meta name="robots" content="noindex,follow">')
    H.append(f'<link rel="canonical" href="{url}">')
    H += alts
    H += [f'<meta property="og:type" content="{og_type}">', '<meta property="og:site_name" content="Lokali">', '<meta property="og:locale" content="en">',
          f'<meta property="og:title" content="{esc(title)}">', f'<meta property="og:description" content="{esc(desc)}">', f'<meta property="og:url" content="{url}">']
    if img:
        H.append(f'<meta property="og:image" content="{esc(img)}">')
    H += ['<meta name="twitter:card" content="summary_large_image">', G.FONTS, '<script type="application/ld+json">',
          json.dumps(g, ensure_ascii=False), '</script>']
    if theme:
        H.append(theme.group(0))
    H += ['<link rel="stylesheet" href="/explore/assets/lk-1.css">', '</head>', '<body>']
    return NL.join(H)


def topbar_of(old):
    m = re.search(r'<header class="topbar">.*?</header>', old or "", re.S)
    return m.group(0) if m else G.TOPBAR


def appbar_of(old, content):
    m = re.search(r'<div class="appbar-cta" id="gpb">.*?</script>', old or "", re.S)
    return m.group(0) if m else G.appbar(content)


def hero_img_of(old):
    m = re.search(r'<section class="hero"><img src="([^"]+)"', old or "")
    return html.unescape(m.group(1)) if m else None


def credit_html(c):
    who = txt(c["artist"]) if c["artist"] else "Wikimedia Commons contributor"
    lic = f' &middot; {txt(c["lic"])}' if c["lic"] else ""
    return f'<p class="credit">Photo: <a href="{esc(c["page"])}" rel="nofollow noopener" target="_blank">{who}</a>{lic} &middot; Wikimedia Commons</p>'


def faq_html(F):
    return G.sec("Questions", "Common questions", '<div class="faq">' + NL + NL.join(f"<h3>{txt(q)}</h3>{NL}<p>{txt(x)}</p>" for q, x in F) + NL + "</div>")


def wr(rel, h):
    p = os.path.join(STAGE, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p + ".tmp", "w", encoding="utf-8") as fh:
        fh.write(h)
    os.replace(p + ".tmp", p)


# ------------------------------------------------------------------ city hubs
by_city = collections.defaultdict(list)
for a in I:
    by_city[a["city"]].append(a)


def parse_cards(old):
    g = re.search(r'<div class="grid">(.*?)</div></section>', old, re.S)
    out = []
    for m in re.finditer(r'<a class="icard" href="([^"]+)">(.*?)</a>(?=<a class="icard"|$)', g.group(1) if g else "", re.S):
        body = m.group(2)
        name = html.unescape(re.search(r"<b>(.*?)</b>", body, re.S).group(1))
        small = re.search(r"<small>(.*?)</small>", body, re.S)
        small = small.group(1) if small else ""
        typ = html.unescape(small.split("&middot;")[-1]).strip() if "&middot;" in small else ""
        url = html.unescape(m.group(1))
        rel = url.split("/explore/", 1)[-1]
        if rel not in META:
            continue        # a card a previous run of the wave added: rebuilt from items below
        out.append({"url": url, "html": re.sub(r'<span class="rk">#\d+</span>', "{RK}", m.group(0)), "name": name, "type": typ,
                    "geo": (META.get(rel) or {}).get("geo")})
    return out


def card_from_page(rel):
    p = rd(f"{EXP}/{rel}")
    url = f"{BASE}/explore/{rel}"
    name = html.unescape(re.sub(r"<[^>]+>", "", re.search(r"<h1[^>]*>(.*?)</h1>", p, re.S).group(1))).strip()
    img = re.search(r'<meta property="og:image" content="([^"]+)"', p)
    img = html.unescape(img.group(1)) if img else None
    row = lambda k: (lambda m: html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip() if m else "")(
        re.search(r"<tr><th>" + k + r"</th><td>(.*?)</td></tr>", p, re.S))
    typ, tn = row("Type"), row("Time needed")
    small = " &middot; ".join(txt(x) for x in (tn, typ) if x)
    lead = re.search(r'<p class="lead">(.*?)</p>', p, re.S)
    br = ""
    if lead:
        t = html.unescape(re.sub(r"<[^>]+>", "", lead.group(1))).strip()
        br = re.split(r"(?<=[.!?])\s+", t)[0]
        if len(br) > 120:
            br = br[:118].rsplit(" ", 1)[0].rstrip(",;:") + "…"
    return {"url": url, "html": icard(url, img, name, small, br, 0).replace('<span class="rk">#0</span>', "{RK}"), "name": name,
            "type": typ, "geo": (META.get(rel) or {}).get("geo")}


def city_hub(slug):
    info = PLAN["city"][slug]
    path = f"{EXP}/en/{slug}.html"
    # Only a hub that existed before the wave is "old" (META is the pre-wave snapshot),
    # so re-running the wave rebuilds its own hubs from scratch instead of from its last output.
    old = rd(path) if f"en/{slug}.html" in META and os.path.exists(path) else None
    name = info["name"]
    url = f"{BASE}/explore/en/{slug}.html"
    new = sorted(by_city[slug], key=lambda a: RANK.get(a["q"], 9999))
    olds = parse_cards(old) if old else []
    have = {c["url"] for c in olds}
    items = [dict(c, new=False) for c in olds]
    # Pre-wave pages of this city that the old hub never listed (added after it was
    # built, or a small hub whose markup had no cards): give them a card too.
    for rel in sorted(k for k, v in META.items() if k.startswith(f"en/{slug}/") and k.count("/") == 2
                      and not v.get("ni") and v.get("can") == k):
        u = f"{BASE}/explore/{rel}"
        if u in have or not os.path.exists(f"{EXP}/{rel}"):
            continue
        items.append(dict(card_from_page(rel), new=False))
        have.add(u)
    for a in new:
        u = f'{BASE}/explore/en/{slug}/{a["slug"]}.html'
        if u in have:
            continue
        items.append({"url": u, "name": a["title"], "type": G.type_label(a["cat"]), "geo": (a["lat"], a["lng"]), "new": True, "a": a})
    n = len(items)
    # country of the hub: the old crumb, else the new pages' most common country
    if old:
        cm = re.search(r'<a href="(https://lokali\.travel/explore/en/country/[^"]+)">([^<]+)</a>', old)
        cname = html.unescape(cm.group(2)) if cm else None
        cc = re.search(r'"addressCountry": "([A-Z]{2})"', old)
        cc = cc.group(1) if cc else None
    else:
        cname = None
        cc = None
    if not cname:
        cname = collections.Counter(a["country"] for a in new).most_common(1)[0][0]
    if not cc:
        cc = collections.Counter(a["cc"] for a in new if a["cc"]).most_common(1)[0][0] if any(a["cc"] for a in new) else None
    cslug = PLAN["country"].get(cname)
    c_url = f"{BASE}/explore/en/country/{cslug}.html" if cslug else None

    top = [i["name"] for i in items[:3]]
    types = collections.Counter(i["type"] for i in items if i["type"])
    tag = " &middot; ".join(f"{k} {txt(plural(t, k))}" for t, k in types.most_common(5))
    cover = andlist([f"{k} {plural(t, k)}" for t, k in types.most_common(3)]) if types else ""
    D = span_km([tuple(i["geo"]) if i["geo"] else None for i in items])
    guides = "guide" if n == 1 else "guides"
    lead = f"{name} has {n} free Lokali audio {guides}, led by {andlist(top)}." if n > 1 else f"{name} has 1 free Lokali audio guide: {top[0]}."
    if cover and n > 1:
        lead += f" The list covers {cover}."
    ds = dist_sentence(D)
    if ds:
        lead += " " + ds
    lead += " Every guide plays free in 50+ languages and works offline once downloaded."
    for t in (f"{name} Audio Guide — {n} Free Self-Guided Tours | Lokali", f"{name} — {n} Free Audio Guides | Lokali", f"{name} Audio Guides | Lokali"):
        if len(t) <= 62:
            title = t
            break
    else:
        title = f"{name[:40]} — Free Audio Guides | Lokali"
    for k in (3, 2, 1):
        desc = (f"Free {name} audio guides for {n} sights including {andlist(top[:k])}. Stories, what to look for and tips "
                f"in 50+ languages, offline.")
        if len(desc) <= 158:
            break
    desc = G.shrink(desc)
    F = [(f"How many free audio guides does Lokali have for {name}?", f"{n}. Each one is free, plays in 50+ languages and works offline once downloaded."),
         (f"What are the top sights in {name}?", f"{andlist(top)}. The full list of {n} sights, each with its type and a short description, is on this page."),
         (f"Do you need to pay for a guide in {name}?", "No. Every Lokali audio guide is free, with no ticket, tour group or subscription.")]
    geos = [tuple(i["geo"]) for i in items if i["geo"]]
    ldd = {"@type": "TouristDestination", "name": name, "description": lead, "url": url,
           "includesAttraction": [{"@type": "TouristAttraction", "name": i["name"], "url": i["url"]} for i in items]}
    if geos:
        ldd["geo"] = {"@type": "GeoCoordinates", "latitude": round(sorted(g[0] for g in geos)[len(geos) // 2], 4),
                      "longitude": round(sorted(g[1] for g in geos)[len(geos) // 2], 4)}
    ldd["address"] = {"@type": "PostalAddress", "addressLocality": name, **({"addressCountry": cc} if cc else {})}
    cr = [{"@type": "ListItem", "position": 1, "name": "Lokali", "item": BASE},
          {"@type": "ListItem", "position": 2, "name": "Explore", "item": f"{BASE}/explore/index.html"}]
    if c_url:
        cr.append({"@type": "ListItem", "position": 3, "name": cname, "item": c_url})
    cr.append({"@type": "ListItem", "position": len(cr) + 1, "name": name, "item": url})
    g = {"@context": "https://schema.org", "@graph": [ldd,
         {"@type": "ItemList", "name": f"Free audio guides in {name}", "numberOfItems": n,
          "itemListElement": [{"@type": "ListItem", "position": k + 1, "name": i["name"], "url": i["url"]} for k, i in enumerate(items)]},
         {"@type": "BreadcrumbList", "itemListElement": cr},
         {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": x}} for q, x in F]}]}
    img = hero_img_of(old)
    if img and re.search(r"\.svg|logo", img, re.I):
        img = None          # an old hub that fell back to a museum logo
    credit = next((a["credit"] for a in I if img and a["img"] == img), None)
    if not img:
        first = next((i["a"] for i in items if i.get("new") and i["a"]["img"]), None)
        if first:
            img, credit = first["img"], first["credit"]
        # 3+ guides makes a hub indexable; a hub that was already indexable stays so
    was_indexed = f"en/{slug}.html" in META and not META[f"en/{slug}.html"].get("ni")
    noindex = n < 3 and not was_indexed
    H = [head_block(old, title, desc, url, img, g, noindex=noindex), topbar_of(old), '<main class="wrap">']
    crumbs = [f'<a href="{BASE}">Lokali</a>', f'<a href="{BASE}/explore/index.html">Explore</a>']
    if c_url:
        crumbs.append(f'<a href="{c_url}">{txt(cname)}</a>')
    crumbs.append(f"<span>{txt(name)}</span>")
    H.append('<nav class="crumbs" aria-label="Breadcrumb">' + ' <span class="sep">&rsaquo;</span> '.join(crumbs) + "</nav>")
    copy = (f'<div class="hero-copy"><span class="badge">{n} free audio {guides}</span><h1>{txt(name)}</h1><p class="tag">{tag}</p><div class="btns">'
            f'<a class="btn gold" href="https://lokali.travel" rel="nofollow" target="_blank"><span class="pl">&#9654;</span>Open the Lokali app</a>'
            f'<a class="btn ghost" href="#places">See all {n} places &darr;</a></div></div>')
    if img:
        H.append(f'<section class="hero"><img src="{esc(img)}" alt="{esc(name)}" fetchpriority="high" decoding="async"><span class="ov"></span>{copy}</section>')
        if credit:
            H.append(credit_html(credit))
    else:
        H.append(f'<section class="hero noimg"><span class="ov"></span>{copy}</section>')
    st = [f'<div class="st"><b>{n}</b><span>free audio {guides}</span></div>']
    if ds:
        st.append(f'<div class="st"><b>{round(D) if D >= 3 else round(D, 1)}</b><span>km end to end</span></div>')
    st.append('<div class="st"><b>50+</b><span>languages, offline</span></div>')
    H.append('<div class="stats">' + "".join(st) + "</div>")
    H.append(f'<p class="lead">{txt(lead)}</p>')
    H.append(f'<p class="verified">&#10003; <b>Updated {MONTH}</b> &middot; <a href="{G.EDIT}">how we write these guides</a></p>')
    cards = []
    for k, i in enumerate(items, 1):
        if i["new"]:
            a = i["a"]
            small = f'{G.mins(a["dur"])} min audio' + (f' &middot; {txt(i["type"])}' if i["type"] else "")
            cards.append(icard(i["url"], a["card"], i["name"], small, brief(a), k))
        else:
            cards.append(i["html"].replace("{RK}", f'<span class="rk">#{k}</span>'))
    H.append(f'<section id="places"><div class="shead"><div><span class="eyebrow">{n} free {guides}</span><h2>Free audio guides in {txt(name)}</h2>'
             f'<p>Every place below has a free audio guide in 50+ languages</p></div></div><div class="grid">{"".join(cards)}</div></section>')
    H.append('<div class="narrow" style="margin:0 auto">')
    pm = HAS_PLANNING.search(old or "")
    if pm:
        H.append(pm.group(0))
    H.append(faq_html(F))
    H.append("</div>")
    H.append(f'<section class="apppanel"><div class="ap-copy"><span class="eyebrow">Free &middot; 50+ languages &middot; offline</span><h3>Walk {txt(name)} '
             f'<em>with a guide in your ear</em></h3><p>All {n} {guides} for {txt(name)}, free, offline and in your language. Download them before you land.</p>'
             f'<div class="btns"><a class="btn gold" href="https://lokali.travel" rel="nofollow" target="_blank"><span class="pl">&#9654;</span>Get the Lokali app</a>'
             f'<a class="btn ghost" href="https://lokali.travel/">Try it in the browser</a></div></div>'
             + (f'<div class="ap-img"><img src="{esc(img)}" alt="" loading="lazy" decoding="async"></div>' if img else "") + "</section>")
    foot = [f'<a href="{BASE}/explore/index.html">All cities</a>']
    if c_url:
        foot.append(f'<a href="{c_url}">More in {txt(cname)}</a>')
    foot.append(f'<a href="{G.EDIT}">Editorial process</a>')
    H += ["<footer>", " &middot; ".join(foot), "</footer>", "</main>", appbar_of(old, slug), "", "</body>", "</html>"]
    wr(f"en/{slug}.html", NL.join(H))
    return {"slug": slug, "name": name, "n": n, "country": cname, "url": url, "top": top, "existing": bool(old), "noindex": noindex,
            "img": img}


# ------------------------------------------------------------------ country hubs
def parse_hubcards(old):
    out = []
    for m in re.finditer(r'<a class="hub-card" href="([^"]+)"><span class="hc-head"><b>(.*?)</b><span class="km">(.*?)</span></span><span class="mp-brief">(.*?)</span></a>', old or ""):
        cnt = re.match(r"(\d+)", m.group(3))
        out.append({"url": html.unescape(m.group(1)), "name": html.unescape(m.group(2)), "n": int(cnt.group(1)) if cnt else 0,
                    "brief": html.unescape(m.group(4))})
    return out


def hubcard(url, name, right, br):
    return (f'<a class="hub-card" href="{esc(url)}"><span class="hc-head"><b>{txt(name)}</b><span class="km">{right}</span></span>'
            f'<span class="mp-brief">{txt(br)}</span></a>')


def country_hub(cname, cities_upd, loose):
    slug = PLAN["country"][cname]
    path = f"{EXP}/en/country/{slug}.html"
    old = rd(path) if f"en/country/{slug}.html" in META and os.path.exists(path) else None
    url = f"{BASE}/explore/en/country/{slug}.html"
    cities = parse_hubcards(old) if old else []
    # drop the "More places" cards a previous run may have written: they are rebuilt below
    cities = [c for c in cities if re.match(r"https://lokali\.travel/explore/en/[^/]+\.html$", c["url"])
              and c["url"].split("/explore/", 1)[-1] in META]
    byurl = {c["url"]: c for c in cities}
    for h in cities_upd:
        if h["noindex"]:
            byurl.pop(h["url"], None)
            continue
        byurl[h["url"]] = {"url": h["url"], "name": h["name"], "n": h["n"], "brief": ", ".join(h["top"][:3])}
    cities = sorted(byurl.values(), key=lambda c: -c["n"])
    loose = sorted(loose, key=lambda a: RANK.get(a["q"], 9999))
    total = sum(c["n"] for c in cities) + len(loose)
    nc = len(cities)
    lead_parts = []
    if nc:
        lead_parts.append(f"Lokali has {total} free audio guides in {cname}" + (f", across {nc} {'city' if nc == 1 else 'cities'}" if nc else "") +
                          (f" and {len(loose)} more {'place' if len(loose) == 1 else 'places'} outside them" if loose else "") +
                          f", led by {andlist([c['name'] for c in cities[:3]])}.")
    else:
        lead_parts.append(f"Lokali has {total} free audio {'guide' if total == 1 else 'guides'} in {cname}, led by {andlist([a['title'] for a in loose[:3]])}.")
    lead_parts.append("Every guide plays free in 50+ languages and works offline once downloaded.")
    lead = " ".join(lead_parts)
    for t in (f"{cname} Audio Guides — {total} Free Self-Guided Tours | Lokali", f"{cname} — {total} Free Audio Guides | Lokali", f"{cname} Audio Guides | Lokali"):
        if len(t) <= 62:
            title = t
            break
    names = [c["name"] for c in cities[:3]] or [a["title"] for a in loose[:3]]
    for k in (3, 2, 1):
        desc = (f"Free audio guides for {total} sights in {cname}, including {andlist(names[:k])}. Stories, what to look for and tips "
                f"in 50+ languages, offline.")
        if len(desc) <= 158:
            break
    desc = G.shrink(desc)
    F = [(f"How many free audio guides does Lokali have in {cname}?",
          f"{total}" + (f", across {nc} {'city' if nc == 1 else 'cities'}" if nc else "") + ". Every guide is free and plays in 50+ languages.")]
    if cities:
        F.append((f"Which city in {cname} has the most audio guides?", f"{cities[0]['name']}, with {cities[0]['n']}."))
    F.append((f"Is the {cname} audio guide free?",
              "Yes. Every Lokali audio guide is free, with no ticket, tour group or subscription, and works offline once downloaded."))
    lst = [{"@type": "ListItem", "position": k + 1, "name": c["name"], "url": c["url"]} for k, c in enumerate(cities)]
    lst += [{"@type": "ListItem", "position": len(lst) + k + 1, "name": a["title"], "url": f'{BASE}/explore/en/{a["city"]}/{a["slug"]}.html'} for k, a in enumerate(loose)]
    g = {"@context": "https://schema.org", "@graph": [
        {"@type": "CollectionPage", "name": f"Free audio guides in {cname}", "url": url, "description": lead, "inLanguage": "en"},
        {"@type": "ItemList", "name": f"Free Lokali audio guides in {cname}", "numberOfItems": len(lst), "itemListElement": lst},
        {"@type": "BreadcrumbList", "itemListElement": [{"@type": "ListItem", "position": 1, "name": "Lokali", "item": BASE},
                                                        {"@type": "ListItem", "position": 2, "name": "Explore", "item": f"{BASE}/explore/index.html"},
                                                        {"@type": "ListItem", "position": 3, "name": cname, "item": url}]},
        {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": x}} for q, x in F]}]}
    img = None
    if old:
        img = hero_img_of(old)
    credit = next((a["credit"] for a in I if img and a["img"] == img), None)
    if not img and not old:
        first = next((a for a in loose if a["img"]), None) or next((a for c in cities_upd for a in by_city.get(c["slug"], []) if a["img"]), None)
        if first:
            img, credit = first["img"], first["credit"]
    H = [head_block(old, title, desc, url, img, g, noindex=total < 3), topbar_of(old), '<main class="wrap">',
         f'<nav class="crumbs" aria-label="Breadcrumb"><a href="{BASE}">Lokali</a> <span class="sep">&rsaquo;</span> '
         f'<a href="{BASE}/explore/index.html">Explore</a> <span class="sep">&rsaquo;</span> <span>{txt(cname)}</span></nav>']
    tag = (f"{nc} {'city' if nc == 1 else 'cities'}" + (f" &middot; {len(loose)} more {'place' if len(loose) == 1 else 'places'}" if loose else "")) if nc else \
        f"{total} {'place' if total == 1 else 'places'}"
    play = f"https://play.google.com/store/apps/details?id=app.lokali.travel&amp;utm_source=seo&amp;utm_medium=explore&amp;utm_campaign=en-{esc(slug)}"
    copy = (f'<div class="hero-copy"><span class="badge">{total} free audio guides</span><h1>{txt(cname)}</h1><p class="tag">{tag}</p><div class="btns">'
            f'<a class="btn gold" href="{play}" rel="nofollow" target="_blank"><span class="pl">&#9654;</span>Get the Lokali app</a></div></div>')
    if img:
        H.append(f'<section class="hero"><img src="{esc(img)}" alt="{esc(cname)}" fetchpriority="high" decoding="async"><span class="ov"></span>{copy}</section>')
        if credit:
            H.append(credit_html(credit))
    else:
        H.append(f'<section class="hero noimg"><span class="ov"></span>{copy}</section>')
    st = [f'<div class="st"><b>{total}</b><span>free audio guides</span></div>']
    if nc:
        st.append(f'<div class="st"><b>{nc}</b><span>{"city" if nc == 1 else "cities"} covered</span></div>')
    st.append('<div class="st"><b>50+</b><span>languages, offline</span></div>')
    H.append('<div class="stats">' + "".join(st) + "</div>")
    H.append(f'<p class="lead">{txt(lead)}</p>')
    H.append(f'<p class="verified">&#10003; <b>Updated {MONTH}</b> &middot; <a href="{G.EDIT}">how we write these guides</a></p>')
    H.append('<div class="narrow" style="margin:0 auto">')
    if cities:
        H.append(G.sec("More", f"Cities in {txt(cname)}", '<div class="hub-list">' + NL + NL.join(
            hubcard(c["url"], c["name"], f'{c["n"]} {"sight" if c["n"] == 1 else "sights"}', c["brief"]) for c in cities) + NL + "</div>"))
        top = cities[0]
        H.append(G.sec("More", "Where to start", f'<div class="prose"><p>{txt(top["name"])} has the most to see with {top["n"]} '
                       f'{"guide" if top["n"] == 1 else "guides"}, including {txt(top["brief"])}. Pick a city to see every sight with its type, '
                       f'what to look for and practical tips.</p></div>'))
    if loose:
        H.append(G.sec("More", f"More places in {txt(cname)}", '<div class="hub-list">' + NL + NL.join(
            hubcard(f'{BASE}/explore/en/{a["city"]}/{a["slug"]}.html', a["title"], txt(G.type_label(a["cat"])), a["city_disp"]) for a in loose) + NL + "</div>"))
    H.append(faq_html(F))
    H.append("</div>")
    H.append(f'<section class="apppanel"><div class="ap-copy"><span class="eyebrow">Free &middot; 50+ languages &middot; offline</span><h3>Walk {txt(cname)} '
             f'<em>with a guide in your ear</em></h3><p>All {total} guides for {txt(cname)}, free, offline and in your language. Download them before you land.</p>'
             f'<div class="btns"><a class="btn gold" href="{play}" rel="nofollow" target="_blank"><span class="pl">&#9654;</span>Get the Lokali app</a>'
             f'<a class="btn ghost" href="https://lokali.travel/">Try it in the browser</a></div></div>'
             + (f'<div class="ap-img"><img src="{esc(img)}" alt="" loading="lazy" decoding="async"></div>' if img else "") + "</section>")
    H += ["<footer>", f'<a href="{BASE}/explore/index.html">All cities</a> &middot; <a href="{G.EDIT}">Editorial process</a>', "</footer>", "</main>",
          appbar_of(old, f"country-{slug}"), "", "</body>", "</html>"]
    wr(f"en/country/{slug}.html", NL.join(H))
    return {"country": cname, "slug": slug, "total": total, "cities": nc, "loose": len(loose), "existing": bool(old)}


if __name__ == "__main__":
    city_rep = [city_hub(s) for s in sorted(PLAN["city"])]
    hubs_by_country = collections.defaultdict(list)
    for h in city_rep:
        hubs_by_country[h["country"]].append(h)
    loose = collections.defaultdict(list)
    for a in I:
        h = PLAN["city"].get(a["city"])
        rep = next((r for r in city_rep if r["slug"] == a["city"]), None)
        if not h or (rep and rep["noindex"]):
            loose[a["country"]].append(a)
    countries = set(hubs_by_country) | set(loose)
    country_rep = [country_hub(c, hubs_by_country.get(c, []), loose.get(c, [])) for c in sorted(countries) if c in PLAN["country"]]
    json.dump({"city": city_rep, "country": country_rep}, open(os.path.join(STAGE, "hubs_report.json"), "w"), ensure_ascii=False, indent=0)
    print("city hubs", len(city_rep), "(new", sum(not h["existing"] for h in city_rep), ")  country hubs", len(country_rep),
          "(new", sum(not c["existing"] for c in country_rep), ")")
    print("no country hub for:", sorted(c for c in countries if c not in PLAN["country"]))
