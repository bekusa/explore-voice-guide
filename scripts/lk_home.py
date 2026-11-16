#!/usr/bin/env python3
"""
Explore home pages, one per language (Beka 2026-11-14: "do it in every language and let's launch").

    python scripts/lk_home_scan.py <cache>            # read the published pages (see that file)
    python scripts/lk_home.py <cache> [lang ...]       # write the home pages (all languages by default)

Writes
    public/explore/index.html                  English home (same URL as before)
    public/explore/<lang>/index.html           every language in scripts/lk_home_text.json
    public/explore/search-index.json           English search list (cities, countries, places)
    public/explore/assets/search/<lang>.json   the language's own cities and places (the page adds the English list)
    public/explore/assets/geo/<lang>.json      "Near me": coordinates of the published places and cities
    public/sitemap-explore-home.xml            the home pages with their hreflang set

Everything shown comes from pages a visitor can already open (h1, lead, photo, JSON-LD coordinates);
the copy around it is scripts/lk_home_text.json; look and behaviour are the shared files
public/explore/assets/lk-home.css and lk-home.js. No counts of guides, places, cities or countries.
"""
import collections
import datetime
import glob
import html
import json
import math
import os
import re
import statistics
import sys
import unicodedata
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from lk_sys import SITE, FONTS, card_img  # noqa: E402
from lk_l10n import L10N  # noqa: E402
import lk_post  # noqa: E402

PUB = os.path.normpath(os.path.join(HERE, "..", "public"))
EXP = os.path.join(PUB, "explore")
CACHE = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)
ONLY = set(sys.argv[2:])

with open(os.path.join(HERE, "lk_home_text.json"), encoding="utf-8") as fh:
    TEXT = json.load(fh)
LANGS = [k for k in TEXT if not k.startswith("_")]          # "en" first
HL = {"zh-cn": "zh-Hans", "zh-tw": "zh-Hant", "pt-br": "pt-BR"}
RTL = {"ar", "he", "fa", "ur"}
AUTONYM = {"en": "English", "fr": "Français", "de": "Deutsch", "es": "Español", "it": "Italiano", "nl": "Nederlands",
           "pl": "Polski", "sv": "Svenska", "nb": "Norsk", "da": "Dansk", "fi": "Suomi", "cs": "Čeština", "hu": "Magyar",
           "ro": "Română", "hr": "Hrvatski", "ru": "Русский", "uk": "Українська", "bg": "Български", "sr": "Српски",
           "el": "Ελληνικά", "tr": "Türkçe", "az": "Azərbaycanca", "hy": "Հայերեն", "ar": "العربية", "he": "עברית",
           "fa": "فارسی", "hi": "हिन्दी", "bn": "বাংলা", "ta": "தமிழ்", "te": "తెలుగు", "mr": "मराठी", "ur": "اردو",
           "ka": "ქართული", "ja": "日本語", "ko": "한국어", "zh-cn": "简体中文", "zh-tw": "繁體中文", "th": "ไทย",
           "vi": "Tiếng Việt", "id": "Bahasa Indonesia", "ms": "Bahasa Melayu", "sw": "Kiswahili", "af": "Afrikaans",
           "pt-br": "Português (Brasil)"}
APPSTORE = "https://apps.apple.com/app/id6828065471"
PLAY = "https://play.google.com/store/apps/details?id=app.lokali.travel&amp;utm_source=seo&amp;utm_medium=explore&amp;utm_campaign=home-{}"
PL = "&#9654;&#xFE0E;"
TODAY = datetime.date.today()

# The six regions of the "Travel by region" tabs, by English country-hub slug
CONT = [
 ("cont_europe", "albania austria belarus belgium bosnia-and-herzegovina bulgaria croatia cyprus czechia denmark estonia "
  "finland france germany greece hungary iceland ireland italy kosovo latvia liechtenstein lithuania luxembourg malta "
  "moldova monaco montenegro netherlands north-macedonia norway poland portugal romania russia serbia slovakia slovenia "
  "spain sweden switzerland ukraine united-kingdom va"),
 ("cont_mideast", "armenia azerbaijan georgia türkiye israel jordan lebanon syria iraq iran saudi-arabia "
  "united-arab-emirates qatar bahrain oman yemen"),
 ("cont_asia", "afghanistan bangladesh bhutan brunei cambodia china india indonesia japan kazakhstan kyrgyzstan laos "
  "malaysia mongolia myanmar nepal pakistan philippines singapore south-korea sri-lanka taiwan tajikistan thailand tm "
  "uzbekistan vietnam"),
 ("cont_africa", "algeria benin botswana ci democratic-republic-of-the-congo egypt ethiopia gabon ghana kenya libya "
  "madagascar malawi mali morocco mozambique namibia nigeria rwanda senegal south-africa sudan tanzania tunisia uganda "
  "zambia zimbabwe"),
 ("cont_americas", "argentina bb belize bolivia brazil canada chile colombia costa-rica cuba dominican-republic ecuador "
  "el-salvador greenland guatemala haiti mexico nicaragua panama peru united-states venezuela"),
 ("cont_oceania", "australia new-zealand pg"),
]
CONT_OF = {s: k for k, v in CONT for s in v.split()}

# Collections: the same editorial themes as the old index (lk_index.py), matched to the pages' own "type".
# Each leads with world-famous places (no trustworthy popularity signal exists), then fills by type.
THEMES = [
 ({"Archaeological Site", "Historic Site", "Mausoleum", "Historic Town", "Ruins", "World Heritage Site"},
  ["colosseum", "roman forum", "treasury", "petra", "ephesus", "gobekli tepe", "terracotta army", "pantheon", "pompeii",
   "mount nemrut", "pamukkale", "persepolis", "angkor wat", "chichen itza", "teotihuacan", "machu picchu"]),
 ({"Museum"},
  ["louvre museum", "prado museum", "uffizi gallery", "musee d'orsay", "british museum", "metropolitan museum",
   "vatican museums", "uffizi", "rijksmuseum", "hermitage museum", "orsay", "grand egyptian", "acropolis museum",
   "istanbul archaeology"]),
 ({"Temple", "Cathedral", "Church", "Mosque", "Monastery", "Shrine", "Synagogue"},
  ["ayasofya", "blue mosque", "sagrada familia", "st. peter's basilica", "notre-dame de paris",
   "notre-dame cathedral", "sheikh zayed", "wat arun", "wat pho", "senso-ji", "fushimi inari", "saint basil",
   "sioni cathedral", "temple of heaven", "golden temple"]),
 ({"Palace", "Castle", "Fort", "Fortress", "Fortification", "Chateau"},
  ["topkapi", "alhambra", "versailles", "forbidden city", "neuschwanstein", "grand palace", "prague castle",
   "dolmabahce", "schonbrunn palace", "tower of london", "narikala fortress", "narikala", "edinburgh castle"]),
 ({"Neighborhood", "Square", "Street"},
  ["montmartre", "trastevere", "gothic quarter", "balat", "alfama", "plaka", "le marais", "old town square",
   "sultanahmet", "piazza navona", "grand place"]),
 ({"Market", "Food Market"},
  ["grand bazaar", "spice bazaar", "chatuchak", "boqueria", "borough market", "tsukiji outer market", "dry bridge"]),
 ({"Viewpoint", "Park", "Waterfall", "Beach", "Garden", "Botanical Garden", "Bridge", "National Park"},
  ["central park", "gardens by the bay", "galata", "tower bridge", "charles bridge", "golden gate bridge", "retiro",
   "mtatsminda", "victoria peak"]),
]
AVOID = ["knossos", "bosphorus strait"]      # source photo is a map
FALLBACK_IMG = "images/museums/louvre.jpg"
SLIDES = ["istanbul", "rome", "tbilisi", "paris", "bangkok"]
SUSPECT_KM = 80                              # = build-near-index.py: a page this far from its city is left out of Near me


# ------------------------------------------------------------------ data
def esc(x):
    return html.escape(x or "", quote=True)


def load(lang):
    rows = []
    for f in sorted(glob.glob(os.path.join(CACHE, lang + ".json")) + glob.glob(os.path.join(CACHE, lang + "@*.json"))):
        with open(f, encoding="utf-8") as fh:
            rows += json.load(fh)
    return rows


def url(rel):
    return f"{SITE}/explore/{rel}"


def home_url(lang):
    return f"{SITE}/explore/index.html" if lang == "en" else f"{SITE}/explore/{lang}/index.html"


def norm(s):
    s = unicodedata.normalize("NFKD", (s or "").lower())
    return "".join(c for c in s if not unicodedata.combining(c))


def same(a, b):
    return urllib.parse.unquote(a or "") == urllib.parse.unquote(b or "")


def indexable(r):
    return "noindex" not in r["robots"].lower() and (not r["can"] or same(r["can"], url(r["rel"])))


def rich(r):
    """A page worth featuring: it has its story (or a long lead, as the hand-built museum pages do)."""
    return r["prose"] >= 300 or len(r["lead"]) >= 250


def geo(r):
    try:
        la, lo = float(r["lat"]), float(r["lng"])
    except (TypeError, ValueError):
        return None
    return (la, lo) if -90 <= la <= 90 and -180 <= lo <= 180 and (la, lo) != (0.0, 0.0) else None


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def country_of(r):
    for h, _ in r["crumbs"]:
        m = re.search(r"/explore/en/country/([^/\"]+)\.html", h)
        if m:
            return urllib.parse.unquote(m.group(1))
    return None


def crumb_text(r, href_part):
    for h, t in r["crumbs"]:
        if h and urllib.parse.unquote(h).endswith(href_part):
            return t
    return ""


class Lang:
    """One language's pages, as published."""

    def __init__(self, lang, rows):
        self.lang = lang
        self.rows = rows
        self.cities = {}       # slug -> row
        self.countries = {}    # slug -> row (English only)
        self.attr = []         # indexable attraction rows with a name and a photo
        for r in rows:
            p = r["rel"].split("/")
            if r["kind"] == "city" and r["h1"] and (not r["can"] or same(r["can"], url(r["rel"]))):
                self.cities[p[1][:-5]] = r
            elif r["kind"] == "country" and r["h1"] and indexable(r):
                self.countries[p[2][:-5]] = r
            elif r["kind"] == "attr" and r["h1"] and r["img"] and indexable(r):
                if FALLBACK_IMG in r["img"] and "louvre" not in norm(r["h1"]):
                    continue
                r["city"] = p[1]
                r["slug"] = p[2][:-5]
                self.attr.append(r)
        self.by_url = {urllib.parse.unquote(url(r["rel"])): r for r in self.attr}
        self.per_city = collections.Counter(r["city"] for r in self.attr)
        # two hubs with one name (e.g. "sanliurfa" and "şanlıurfa"): list the stronger one only
        best = {}
        for s, r in self.cities.items():
            k = norm(r["h1"])
            rank = (indexable(r), self.per_city[s], s.isascii())
            if k not in best or rank > best[k][0]:
                best[k] = (rank, s)
        keep = {s for _, s in best.values()}
        self.cities = {s: r for s, r in self.cities.items() if s in keep}

    def city_name(self, r):
        own = self.cities.get(r["city"])
        if own:
            return own["h1"]
        c = crumb_text(r, f"/{self.lang}/{r['city']}.html")
        if not c and len(r["crumbs"]) >= 4:   # Lokali › Explore › [country ›] city › place
            c = r["crumbs"][-2][1]
        return c or r["city"].replace("-", " ").title()

    def meta(self, r):
        return self.city_name(r) + (f" · {r['type']}" if r["type"] and len(r["type"]) <= 24 else "")


def city_photo(slug, r):
    if os.path.exists(os.path.join(PUB, "images", "cities", slug + ".jpg")):
        return f"{SITE}/images/cities/{slug}.jpg"
    return r["img"] if r and FALLBACK_IMG not in (r["img"] or "") else ""


# ------------------------------------------------------------------ choices (English first, then mapped)
def best_match(term, pool):
    c = [a for a in pool if term in norm(a["h1"]) and len(term) / max(1, len(norm(a["h1"]))) >= 0.5]
    return min(c, key=lambda a: len(a["h1"])) if c else None


def pick_rails(L, famous_first, n=12, per_city=2, need=6):
    """[(theme index, [rows])] for one language. famous_first: theme index -> ordered candidate rows."""
    used, used_img, out = set(), set(), []
    cities_n = {norm(r["h1"]) for r in L.cities.values()}
    claimed = {id(a) for v in famous_first.values() for a in v}
    for ti, (types, _) in enumerate(THEMES):
        rest = sorted([a for a in L.attr if L.type_en(a) in types and id(a) not in claimed and rich(a)],
                      key=lambda a: (-(min(a["prose"], 8000) / 1000 + min(L.per_city[a["city"]], 30) / 3), a["h1"]))
        pool = [a for a in famous_first.get(ti, []) + rest if not any(b in norm(a["h1"]) for b in AVOID)]
        items, per, seen = [], collections.Counter(), set()
        for a in pool:
            key = (a["city"], norm(a["h1"]).replace("q", "k")[:7])
            if key in seen or norm(a["h1"]) in cities_n or a["rel"] in used or a["img"] in used_img or per[a["city"]] >= per_city:
                continue
            seen.add(key)
            items.append(a)
            used.add(a["rel"]); used_img.add(a["img"]); per[a["city"]] += 1
            if len(items) == n:
                break
        if len(items) >= need:
            out.append((ti, items))
    return out


def main():
    data = {l: Lang(l, load(l)) for l in LANGS}
    EN = data["en"]
    for r in EN.attr:
        r["type_en"] = r["type"]
    EN.type_en = lambda a: a.get("type_en", "")

    # English twin of every page in another language, from the English pages' hreflang links
    twin = {}   # unquoted L url -> English row
    for r in EN.attr:
        for code, u in r["alt"].items():
            twin[urllib.parse.unquote(u)] = r
    for lang, L in data.items():
        if lang == "en":
            continue
        for r in L.attr:
            e = twin.get(urllib.parse.unquote(url(r["rel"])))
            r["en"] = e
            r["type_en"] = e["type"] if e else ""
        L.type_en = lambda a: a.get("type_en", "")

    # famous places per theme, English
    fam_en = {}
    taken = set()
    for ti, (types, famous) in enumerate(THEMES):
        lst = []
        for f in famous:
            a = best_match(f, EN.attr)
            if a and rich(a) and a["rel"] not in taken:
                lst.append(a); taken.add(a["rel"])
        fam_en[ti] = lst

    def in_lang(L, rows):
        if L.lang == "en":
            return rows
        out = []
        for r in rows:
            u = r["alt"].get(HL.get(L.lang, L.lang))
            o = L.by_url.get(urllib.parse.unquote(u)) if u else None
            if o and rich(o):
                out.append(o)
        return out

    # Near me + search lists are shared by every language page, so they are written once per language
    city_geo = city_coordinates(EN)
    written = []
    for lang in LANGS:
        L = data[lang]
        if not L.cities:
            print(lang, "no city pages, skipped")
            continue
        fam = {ti: in_lang(L, v) for ti, v in fam_en.items()}
        rails = pick_rails(L, fam, need=6 if lang == "en" else 5)
        potd = potd_list(L, fam, rails)
        write_geo(L, city_geo)
        write_search(L, EN)
        if ONLY and lang not in ONLY:
            continue
        doc = page(L, EN, rails, potd)
        rel = "index.html" if lang == "en" else f"{lang}/index.html"
        doc = lk_post.finish(doc, rel)
        p = os.path.join(EXP, rel)
        with open(p, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(doc)
        written.append(lang)
        print(f"{lang:6} {len(doc) // 1024:4} KB | rails {[t + 1 for t, _ in rails]} | potd {len(potd)} | cities {len(L.cities)}")
    write_sitemap([l for l in LANGS if data[l].cities])
    print("home pages written:", len(written))


def potd_list(L, fam, rails, n=14):
    """Place of the day candidates: the famous places first, then the rails, each with its story."""
    out, seen = [], set()
    lists = [fam.get(ti, []) for ti in range(len(THEMES))]
    order = [l[i] for i in range(max(map(len, lists), default=0)) for l in lists if i < len(l)]  # one theme after another
    order += [a for _, items in rails for a in items]
    order += sorted([a for a in L.attr if rich(a)], key=lambda a: -a["prose"])
    for a in order:
        if a["rel"] in seen or not a["lead"] or not rich(a):
            continue
        seen.add(a["rel"])
        out.append({"n": a["h1"], "l": a["lead"], "i": card_img(a["img"]), "u": url(a["rel"]), "m": L.meta(a)})
        if len(out) == n:
            break
    return out


def city_coordinates(EN):
    """Median position of each English city folder's places (the hubs carry no coordinates of their own)."""
    pts = collections.defaultdict(list)
    for r in EN.attr:
        g = geo(r)
        if g:
            pts[r["city"]].append(g)
    return {c: (statistics.median(x[0] for x in v), statistics.median(x[1] for x in v)) for c, v in pts.items() if v}


def write_geo(L, city_geo):
    """assets/geo/<lang>.json — {"c": [[name, slug, lat, lng]], "p": [[lat, lng, name, "city/slug", city index, english twin]]}"""
    cities = [s for s in sorted(L.cities) if s in city_geo]
    ci = {s: i for i, s in enumerate(cities)}
    c = [[L.cities[s]["h1"], s, round(city_geo[s][0], 4), round(city_geo[s][1], 4)] for s in cities]
    p = []
    for r in L.attr:
        g = geo(r)
        if not g or (r["city"] in city_geo and km(g, city_geo[r["city"]]) > SUSPECT_KM):
            continue
        row = [round(g[0], 4), round(g[1], 4), r["h1"], f"{r['city']}/{r['slug']}", ci.get(r["city"], -1)]
        if L.lang != "en":
            e = r.get("en")
            row.append(f"{e['city']}/{e['slug']}" if e else "")
        p.append(row)
    d = os.path.join(EXP, "assets", "geo")
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, L.lang + ".json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump({"c": c, "p": p}, fh, ensure_ascii=False, separators=(",", ":"))


def write_search(L, EN):
    """English: /explore/search-index.json (cities, countries, places). Other languages: assets/search/<lang>.json,
    their own pages only (the page adds the English list, minus the English twins of these)."""
    ent = []
    for s, r in sorted(L.cities.items()):
        cs = country_of(r)
        cn = EN.countries[cs]["h1"] if L.lang == "en" and cs in EN.countries else crumb_text(r, f"/country/{cs}.html") if cs else ""
        e = {"t": r["h1"], "s": cn, "u": url(r["rel"]), "i": card_img(city_photo(s, r)) or "", "k": "City"}
        if L.lang != "en" and s in EN.cities:
            e["e"] = url(EN.cities[s]["rel"])
        ent.append(e)
    if L.lang == "en":
        for s, r in sorted(L.countries.items()):
            ent.append({"t": r["h1"], "s": "", "u": url(r["rel"]), "i": card_img(r["img"]) or "", "k": "Country"})
    for r in L.attr:
        e = {"t": r["h1"], "s": L.meta(r), "u": url(r["rel"]), "i": card_img(r["img"]), "k": "Place"}
        if L.lang != "en" and r.get("en"):
            e["e"] = url(r["en"]["rel"])
        ent.append(e)
    if L.lang == "en":
        p = os.path.join(EXP, "search-index.json")
    else:
        os.makedirs(os.path.join(EXP, "assets", "search"), exist_ok=True)
        p = os.path.join(EXP, "assets", "search", L.lang + ".json")
    with open(p, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(ent, fh, ensure_ascii=False, separators=(",", ":"))


def write_sitemap(langs):
    alts = "".join(f'\n    <xhtml:link rel="alternate" hreflang="{HL.get(l, l)}" href="{home_url(l)}"/>' for l in langs)
    alts += f'\n    <xhtml:link rel="alternate" hreflang="x-default" href="{home_url("en")}"/>'
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for l in langs:
        out.append(f"  <url>\n    <loc>{home_url(l)}</loc>\n    <lastmod>{TODAY.isoformat()}</lastmod>\n"
                   f"    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>{alts}\n  </url>")
    out.append("</urlset>\n")
    with open(os.path.join(PUB, "sitemap-explore-home.xml"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(out))


# ------------------------------------------------------------------ page
ICONS = ['<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
         '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
         '<path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14"/>',
         '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>']


def pcard(u, img, name, meta, cls="pcard"):
    return (f'<a class="{cls}" href="{esc(u)}"><img src="{esc(card_img(img))}" alt="{esc(name)}" loading="lazy" '
            f'decoding="async" width="500" height="625"><span class="cov"></span>'
            f'<span class="meta"><b>{esc(name)}</b><small>{esc(meta)}</small></span></a>')


def sort_key(name):
    return norm(name).strip("'\"()")


def page(L, EN, rails, potd):
    lang, T = L.lang, TEXT[L.lang]
    t = lambda k: T.get(k) or TEXT["en"][k]
    hl = HL.get(lang, lang)
    rtl = lang in RTL
    arrow = "&larr;" if rtl else "&rarr;"
    me = home_url(lang)
    langs = [l for l in LANGS if os.path.exists(os.path.join(EXP, l)) or l == "en"]

    # head
    alts = "\n".join(f'<link rel="alternate" hreflang="{HL.get(l, l)}" href="{home_url(l)}">' for l in langs)
    alts += f'\n<link rel="alternate" hreflang="x-default" href="{home_url("en")}">'
    slides = [s for s in SLIDES if os.path.exists(os.path.join(PUB, "images", "cities", s + ".jpg"))]
    s0 = f"{SITE}/images/cities/{slides[0]}.jpg"
    faq = [(t(f"faq{i}_q"), t(f"faq{i}_a")) for i in range(1, 5)]
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "CollectionPage", "@id": me + "#page", "name": t("page_name"), "url": me, "description": t("desc"),
         "inLanguage": hl, "isPartOf": {"@type": "WebSite", "name": "Lokali", "url": SITE + "/"}},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Lokali", "item": SITE + "/"},
            {"@type": "ListItem", "position": 2, "name": t("nav_explore"), "item": me}]},
        {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q,
                                             "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]}]}

    # top bar with the language menu (every home page)
    active = ' class="active"'
    menu = "".join(f'<a href="{home_url(l)}" hreflang="{HL.get(l, l)}" lang="{HL.get(l, l)}"'
                   f'{active if l == lang else ""}>{esc(AUTONYM.get(l, l))}</a>' for l in langs)
    topbar = (f'<header class="topbar"><div class="wrap"><a class="brand" href="{SITE}/">Lokali</a>'
              f'<nav class="nav"><a href="{me}" class="on">{esc(t("nav_explore"))}</a>'
              f'<a href="{SITE}/blog.html">{esc(t("nav_journal"))}</a><a href="{SITE}/">{esc(t("nav_app"))}</a></nav>'
              f'<div class="tb-right"><details class="lang-dd"><summary aria-label="{esc(t("lang_label"))}">'
              f'{esc(AUTONYM.get(lang, lang))}</summary><nav class="lang-menu">{menu}</nav></details>'
              f'<a class="getapp" href="{PLAY.format("topbar-" + lang)}" rel="nofollow" target="_blank">'
              f'<span class="pl">{PL}</span>Listen in app</a></div></div></header>')

    HI, LZ = 'fetchpriority="high"', 'loading="lazy"'
    slide_html = "".join(
        f'<img src="{SITE}/images/cities/{s}.jpg" alt="{esc((L.cities.get(s) or EN.cities.get(s) or {}).get("h1", s.title()))}" '
        f'data-i="{i}" style="opacity:{1 if i == 0 else 0}" {HI if i == 0 else LZ} decoding="async">'
        for i, s in enumerate(slides))

    how = "".join(f'<div class="hm-how-i"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" '
                  f'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICONS[i]}</svg>'
                  f'<b>{esc(t(f"how{i + 1}_t"))}</b><p>{esc(t(f"how{i + 1}_d"))}</p></div>' for i in range(4))

    # place of the day: the build shows today's pick; lk-home.js keeps it current from the same list
    day = (TODAY - datetime.date(2026, 1, 1)).days
    pd = potd[day % len(potd)] if potd else None
    potd_html = ""
    if pd:
        potd_html = (f'<section class="hm" id="potd"><div class="shead"><div><span class="eyebrow">{esc(t("potd_eye"))}</span>'
                     f'<h2>{t("potd_h2")}</h2></div></div><div class="hm-potd"><a class="ph" id="potd-a" href="{esc(pd["u"])}">'
                     f'<img id="potd-i" src="{esc(pd["i"])}" alt="{esc(pd["n"])}" loading="lazy" decoding="async"></a>'
                     f'<div class="tx"><h3 id="potd-n">{esc(pd["n"])}</h3><p id="potd-l">{esc(pd["l"])}</p>'
                     f'<p class="facts" id="potd-m">{esc(pd["m"])}</p><a class="btn ghost" id="potd-u" href="{esc(pd["u"])}">'
                     f'{esc(t("potd_go"))} {arrow}</a></div></div></section>')

    # travel by region: English = countries, other languages = their own city pages
    groups = collections.OrderedDict((k, []) for k, _ in CONT)
    if lang == "en":
        for s, r in L.countries.items():
            if s in CONT_OF:
                groups[CONT_OF[s]].append((r["h1"], url(r["rel"])))
            else:
                print("  country without a region:", s)
        sub = t("region_p_country")
    else:
        for s, r in L.cities.items():
            k = CONT_OF.get(country_of(r) or "")
            if k:
                groups[k].append((r["h1"], url(r["rel"])))
        sub = t("region_p_city")
    groups = [(k, sorted(v, key=lambda x: sort_key(x[0]))) for k, v in groups.items() if v]
    if lang != "en":  # a language's own city pages: its biggest region first
        groups.sort(key=lambda g: -len(g[1]))
    tabs = "".join(f'<button class="hm-tab{" on" if i == 0 else ""}" type="button" data-t="{i}" aria-selected="{str(i == 0).lower()}">'
                   f'{esc(t(k))}</button>' for i, (k, _) in enumerate(groups))
    panes = "".join(f'<div class="hm-pane{" on" if i == 0 else ""}" data-p="{i}">'
                    + "".join(f'<a href="{esc(u)}">{esc(n)}</a>' for n, u in v) + "</div>" for i, (_, v) in enumerate(groups))
    region = (f'<section class="hm" id="regions"><div class="shead"><div><span class="eyebrow">{esc(t("region_eye"))}</span>'
              f'<h2>{t("region_h2")}</h2><p>{esc(sub)}</p></div></div><div class="hm-tabs" role="tablist">{tabs}</div>{panes}</section>'
              if groups else "")

    # cities to start with
    start = sorted([(s, r) for s, r in L.cities.items() if indexable(r) and city_photo(s, r)],
                   key=lambda x: (-int(os.path.exists(os.path.join(PUB, "images", "cities", x[0] + ".jpg"))), -L.per_city[x[0]], x[1]["h1"]))[:10]
    city_cards = "".join(pcard(url(r["rel"]), city_photo(s, r), r["h1"], t("city_meta"), "pcard wide") for s, r in start)

    # collections: two open rails, the rest behind tiles
    coll = ""
    for j, (ti, items) in enumerate(rails):
        hide = ' hidden' if j >= 2 else ""
        coll += (f'<section class="hm-rail{" hm" if j == 0 else ""}" id="theme{ti + 1}"{hide}><div class="shead"><div>'
                 f'<span class="eyebrow">{esc(t("coll_eye"))}</span><h2>{t(f"theme{ti + 1}_h2")}</h2>'
                 f'<p>{esc(t(f"theme{ti + 1}_p"))}</p></div></div><div class="rail">'
                 + "".join(pcard(url(a["rel"]), a["img"], a["h1"], L.meta(a)) for a in items) + "</div></section>")
    if len(rails) > 2:
        coll += '<div class="hm-themes">' + "".join(
            f'<button class="hm-theme" type="button" data-theme="theme{ti + 1}" aria-expanded="false"><b>{t(f"theme{ti + 1}_h2")}</b>'
            f'<small>{esc(", ".join(a["h1"] for a in items[:3]))}…</small></button>' for ti, items in rails[2:]) + "</div>"

    # the app
    ap = L10N.get(lang) or L10N["en"]
    anim = f"lang/{lang}.anim.webp" if lang != "en" and os.path.exists(os.path.join(EXP, "assets", "app", "lang", lang + ".anim.webp")) else "cities.anim.webp"
    app = (f'<section class="hm"><div class="hm-app"><div><span class="eyebrow">{ap[0]}</span><h3>{ap[1]}</h3><p>{ap[2]}</p>'
           f'<div class="hm-badges"><a class="hm-as" href="{APPSTORE}" target="_blank" rel="noopener">'
           f'<img src="/explore/assets/app-store-badge.svg" alt="Download on the App Store" width="132" height="44"></a>'
           f'<a class="hm-gp" href="{PLAY.format("app-" + lang)}" target="_blank" rel="noopener">'
           f'<img src="/explore/assets/google-play-badge.png" alt="Get it on Google Play" width="166" height="64"></a></div>'
           f'<div class="hm-qr"><img src="/explore/assets/app-qr-explore.svg" alt="" width="84" height="84" loading="lazy">'
           f'<span>{esc(t("app_qr"))}</span></div></div>'
           f'<div class="hm-phone"><img src="/explore/assets/app/{anim}" alt="{esc(t("app_alt"))}" loading="lazy" decoding="async" '
           f'width="250" height="540"></div></div></section>')

    journal = journal_html(t) if lang == "en" else ""
    faq_html = (f'<section class="hm hm-faq" id="faq"><div class="shead"><div><span class="eyebrow">{esc(t("faq_eye"))}</span>'
                f'<h2>{t("faq_h2")}</h2></div></div>'
                + "".join(f'<details><summary>{esc(q)}</summary><p>{esc(a)}'
                          + (f' <a href="{SITE}/about/editorial-process.html">{esc(t("faq4_link"))}</a>' if i == 3 else "")
                          + "</p></details>" for i, (q, a) in enumerate(faq)) + "</section>")

    az_rows = (sorted(L.cities.values(), key=lambda r: sort_key(r["h1"])) if lang != "en"
               else sorted([r for r in L.cities.values() if indexable(r)], key=lambda r: sort_key(r["h1"])))
    az = "".join(f'<a href="{esc(url(r["rel"]))}">{esc(r["h1"])}</a>' for r in az_rows)

    cfg = {"lang": lang, "home": me, "potd": potd, "t": {k: t(k) for k in (
        "search_none", "kind_city", "kind_place", "kind_country", "near_title", "near_wait", "near_denied",
        "near_fail", "near_none", "near_privacy")}}

    cfg_json = json.dumps(cfg, ensure_ascii=False).replace("</", "<\\/")
    return f'''<!DOCTYPE html>
<html lang="{hl}"{' dir="rtl"' if rtl else ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#110c08">
<meta name="lk-design" content="1">
<script>if(window.Capacitor){{location.replace("{SITE}/");}}</script>
<title>{esc(t("title"))}</title>
<meta name="description" content="{esc(t("desc"))}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<link rel="canonical" href="{me}">
{alts}
<meta property="og:type" content="website"><meta property="og:site_name" content="Lokali"><meta property="og:locale" content="{hl}">
<meta property="og:title" content="{esc(t("title"))}"><meta property="og:description" content="{esc(t("desc"))}">
<meta property="og:url" content="{me}"><meta property="og:image" content="{s0}">
<meta name="twitter:card" content="summary_large_image">
<link rel="preload" as="image" href="{s0}">
{FONTS}
<link rel="stylesheet" href="/explore/assets/lk-1.css">
<link rel="stylesheet" href="/explore/assets/lk-listen.css">
<link rel="stylesheet" href="/explore/assets/lk-home.css">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body class="lk-home">
{topbar}
<main class="wrap">
<nav class="crumbs"><a href="{SITE}/">Lokali</a><span class="sep">&rsaquo;</span><span>{esc(t("nav_explore"))}</span></nav>

<section class="hero hm-hero" id="hero">{slide_html}<span class="ov"></span>
<div class="hero-copy"><span class="badge">{esc(t("badge"))}</span>
<h1>{t("h1")}</h1>
<p class="hm-sub">{esc(t("sub"))}</p>
<div class="btns"><a class="btn gold play" href="{SITE}" rel="nofollow" target="_blank" data-kind="index"><span class="pl">{PL}</span><span class="bt"><b>Listen</b><small>Free</small></span></a>
<a class="btn ghost" href="#cities">{esc(t("browse"))} &darr;</a></div></div>
</section>

<div class="search" role="search">
<div class="sbox">
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
<input id="q" type="search" placeholder="{esc(t("search_ph"))}" autocomplete="off" aria-label="{esc(t("search_aria"))}">
<button class="hm-near" id="near" type="button"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg><span>{esc(t("near"))}</span></button>
<button class="go" id="qgo" type="button">{esc(t("go"))} {arrow}</button>
</div>
<div class="results" id="res" role="listbox"></div>
<div class="hm-nearbox" id="nearbox" aria-live="polite"></div>
</div>

<section class="hm" id="how"><div class="shead"><div><span class="eyebrow">{esc(t("how_eye"))}</span><h2>{t("how_h2")}</h2><p>{esc(t("how_p"))}</p></div></div>
<div class="hm-how">{how}</div></section>

{potd_html}

{region}

<section class="hm" id="cities"><div class="shead"><div><span class="eyebrow">{esc(t("cities_eye"))}</span><h2>{t("cities_h2")}</h2><p>{esc(t("cities_p"))}</p></div></div>
<div class="rail hm-cities">{city_cards}</div></section>

{coll}

{app}

{journal}

{faq_html}

<details class="az"><summary>{esc(t("az"))}</summary><div class="azin">{az}</div></details>

<footer>{esc(t("footer_tag"))}<br>
<a href="{SITE}/">{esc(t("footer_open"))}</a> &middot; <a href="{SITE}/blog.html">{esc(t("nav_journal"))}</a> &middot; <a href="{SITE}/about/editorial-process.html">{esc(t("faq4_link"))}</a></footer>
</main>
<script type="application/json" id="lk-home-data">{cfg_json}</script>
<script src="/explore/assets/lk-home.js" defer></script>
<script src="/explore/assets/lk-sheet.js" defer></script>
</body>
</html>
'''


def journal_html(t):
    """The three newest Journal posts, as listed on /blog.html (English only)."""
    try:
        with open(os.path.join(PUB, "blog.html"), encoding="utf-8") as fh:
            s = fh.read()
    except OSError:
        return ""
    cards = re.findall(r'<a class="card" href="([^"]+)"><img class="th" src="([^"]+)"[^>]*>.*?<h3>(.*?)</h3>', s, re.S)[:3]
    if not cards:
        return ""
    items = "".join(f'<a class="hm-j" href="{u}"><img src="{i}" alt="" loading="lazy" decoding="async" width="600" height="375">'
                    f'<span class="hm-jt"><small>{esc(t("nav_journal"))}</small><b>{h}</b></span></a>' for u, i, h in cards)
    return (f'<section class="hm" id="journal"><div class="shead"><div><span class="eyebrow">{esc(t("journal_eye"))}</span>'
            f'<h2>{t("journal_h2")}</h2></div><a class="seeall" href="{SITE}/blog.html">{esc(t("journal_all"))} &rarr;</a></div>'
            f'<div class="hm-js">{items}</div></section>')


if __name__ == "__main__":
    main()
