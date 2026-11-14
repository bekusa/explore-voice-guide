# -*- coding: utf-8 -*-
"""Last step for every /explore/ page a generator writes (Beka 2026-11-13).

  finish(html, rel)  = lk_listen.apply() + apply() below. Generators call finish() before writing;
                       `python scripts/lk_post.py run <list> <start> <end>` brings existing pages in line.

What apply() does, idempotently:

1. No counts on location pages. "Tbilisi has 38 guides", "70 free audio guides", "5 cities",
   "See all 38 places", "(7)" in titles, the stats boxes, the "How many guides…?" FAQ: the
   numbers change every week as guides are added, so the page would always be out of date
   ("კონკრეტული რიცხვები არ გვინდა ლოკაციებზე"). Visit times, guide minutes, distances to nearby
   places and the "#1" ranks stay; so does numberOfItems in JSON-LD (machine data, kept current by
   the generators). English sentences are rewritten; other languages use per-language rules built
   from their own hub templates (scripts/*str.py), so no new translations were needed.
2. The "✓ Updated / Verified <month> · how we write these guides" line moves to the bottom of the
   page, just above the footer.
3. English country hubs: the city cards lose the three sight names copied from the city list
   ("Tbilisi 38 sights Metekhi Church, …") and their count; the "Where to start" sentence loses its
   count and sight list. The cards themselves are styled in lk_sys.CSS (.hub-list / .hub-card).
4. Site-wide totals go too: the explore index ("565 cities · 7,268 free guides"), the app panel's
   "190+ cities", and in the Journal (blog(), called by soro-sync.py; `python scripts/lk_post.py blog`
   for existing posts) "more than 190 cities in 45 languages" -> "cities around the world in 50+ languages".
"""
import html as H, json, os, re, sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lk_listen  # noqa: E402

EXP = lk_listen.EXP

# ------------------------------------------------------------------ 2. the "Updated" line
VER = re.compile(r'[ \t]*<p class="verified">.*?</p>\n?', re.S)


def move_verified(s):
    m = VER.search(s)
    if not m or "<footer" not in s[m.end():] and "<footer" not in s[:m.start()]:
        return s
    block = m.group(0).strip()
    rest = s[:m.start()] + s[m.end():]
    i = rest.find("<footer")
    if i < 0:
        return s
    return rest[:i] + block + "\n" + rest[i:]


# ------------------------------------------------------------------ 1. counts
EN_RULES = [  # most specific first
    (r"Lokali has \d+ free audio guides? in ([^,.<\"]+?)(?:, across \d+ cit(?:y|ies))?(?: and \d+ more places? outside them)?, led by ",
     r"Lokali's free audio guides in \1 start with "),
    (r"Lokali has \d+ free audio guides? in ([^,.<\"]+?)(?:, across \d+ cit(?:y|ies))?(?: and \d+ more places? outside them)?\.",
     r"Lokali has free audio guides in \1."),
    (r"^([^.<>\"]+?) has \d+ free Lokali audio guides?, led by ", r"\1's free Lokali audio guides start with "),
    (r"([.>\"] *)([^.<>\"]+?) has \d+ free Lokali audio guides?, led by ", r"\1\2's free Lokali audio guides start with "),
    (r"\b\d+ Free Self-Guided Tours", "Free Self-Guided Tours"),
    (r"\b\d+ Free Audio Guides", "Free Audio Guides"),
    (r" for \d+ sights including ", ", including "),
    (r" for \d+ sights in ", " for sights in "),
    (r"Lokali has \d+ free audio guides? across \d+ cit(?:y|ies) in ([^,.<\"]+), led by ", r"Lokali's free audio guides in \1 start with "),
    (r"(^|[.>\"] *)([^.<>\"]+?) has \d+ free Lokali audio guides?, including ", r"\1Free Lokali audio guides in \2 include "),
    (r" ?Visiting all \d+ of them at the pace most people keep would take (?:about )?[\d.,–-]+ (?:hours?|minutes?|days?)\.", ""),
    (r"(\w)s's free Lokali audio guides", r"\1s' free Lokali audio guides"),  # "Alice Springs' …", not "Springs's"
    (r"\b\d+ landmarks? in ([^.<\"]+?) with a free Lokali audio guide", r"Landmarks in \1 with a free Lokali audio guide"),
    (r" ?The furthest two sit [\d.,]+ km apart[^.]*\.", ""),
    (r"See all \d+ places", "See all places"),
    (r">\d+ free guides<", ">Free guides<"),
    (r"The full list of \d+ sights", "The full list of sights"),
    (r", with \d+\.", "."),
    (r"\bAll \d+ guides for ", "Every guide for "),
    (r" has the most to see with \d+ guides?, including [^.<]*\. ", " has the most to see. "),
]


def _one(w):
    w = w.strip()
    if re.match(r"1 ", w):  # "1 mosque" -> "a mosque"
        w = w[2:]
        return ("an " if w[:1].lower() in "aeiou" else "a ") + w
    return re.sub(r"^\d+ ", "", w)


def _covers(m):
    words = [_one(w) for w in re.split(r",| and ", m.group(2)) if w.strip()]
    if not words:
        return ""
    return m.group(1) + (", ".join(words[:-1]) + " and " + words[-1] if len(words) > 1 else words[0]) + "."


def en_fix(s):
    for a, b in EN_RULES:
        s = re.sub(a, b, s)
    s = re.sub(r"( The list covers | Between them they cover )((?:\d+ [^,.]+(?:, | and ))*\d+ [^,.]+)\.", _covers, s)
    s = re.sub(r"<span class=\"badge\">\d+ free audio guides?</span>", '<span class="badge">Free audio guides</span>', s)
    return s


# other languages: rules that turn "<n> free audio guides" into the plain plural, per language
XX_RULES = {
    "ka": [(r"\b\d+ უფასო აუდიოგიდი აქვს", "უფასო აუდიოგიდები აქვს"), (r"\b\d+ უფასო აუდიოგიდი", "უფასო აუდიოგიდები"),
           (r"\b\d+ აუდიოგიდი", "აუდიოგიდები")],
    "de": [(r"\b\d+ kostenlose ", "kostenlose ")],
    "es": [(r"\b\d+ audioguías gratuitas", "audioguías gratuitas"), (r"\b\d+ audioguía gratuita", "audioguías gratuitas")],
    "fr": [(r"propose \d+ audioguides?", "propose des audioguides"), (r"\b\d+ audioguides? gratuits?", "audioguides gratuits"),
           (r"\b\d+ audioguides? Lokali gratuits?", "audioguides Lokali gratuits")],
    "it": [(r"\b\d+ audioguid[ae] gratuit[ae]", "audioguide gratuite"), (r"\b\d+ audioguid[ae] Lokali gratuit[ae]", "audioguide Lokali gratuite")],
    "nl": [(r"\b\d+ gratis audiogids(?:en)?", "gratis audiogidsen"), (r"\b\d+ gratis Lokali-audiogids(?:en)?", "gratis Lokali-audiogidsen")],
    "id": [(r"\b\d+ panduan audio (Lokali )?gratis", r"panduan audio \1gratis")],
    "az": [(r"\b\d+ pulsuz Lokali audio bələdçisi", "pulsuz Lokali audio bələdçiləri"), (r"\b\d+ pulsuz audio bələdçi", "pulsuz audio bələdçi")],
    "ar": [(r"\b\d+ (?:دليلًا صوتيًا مجانيًا|أدلة صوتية مجانية|دليل صوتي مجاني|دليلان صوتيان مجانيان)", "أدلة صوتية مجانية")],
    "he": [(r"\b\d+ מדריכי אודיו חינם", "מדריכי אודיו חינם"), (r"\b\d+ מדריך אודיו חינם", "מדריכי אודיו חינם")],
    "fa": [(r"\b\d+ راهنمای صوتی رایگان", "راهنماهای صوتی رایگان"), (r"۴۵ زبان", "50+ زبان")],
    "ja": [(r"\d+件", "")],
    "ko": [(r" ?\d+개(?=[ :|]|$)", "")],
    "zh": [(r"— \d+ ?个", "— "), (r" ?\d+ ?个", "")],
    "zh-cn": [(r"— \d+ ?个", "— "), (r" ?\d+ ?个", "")],
    "bg": [(r"\b\d+ безплат\w* аудио гид\w*", "безплатни аудио гидове")],
    "ru": [(r"доступ(?:ен|на|но) (?=\d)", "доступны "), (r"\b\d+ бесплатн\w* аудиогид\w*", "бесплатные аудиогиды")],
    "uk": [(r"\b\d+ безкоштовн\w* аудіогід\w*", "безкоштовні аудіогіди")],
    "pl": [(r"\b\d+ bezpłatn\w* audioprzewodnik\w*", "bezpłatne audioprzewodniki")],
    "tr": [(r"— \d+ Ücretsiz Gezi Rehberi", "— Ücretsiz Gezi Rehberleri"), (r"\b\d+ ücretsiz sesli rehber var", "ücretsiz sesli rehberler var"),
           (r"\b\d+ ücretsiz sesli rehber\b", "ücretsiz sesli rehberler")],
}
PAREN = re.compile(r" ?[(（]\d+[)）]")  # "Ilmaiset äänioppaat: CITY (7)." -- the shared template of ~30 languages


def xx_fix(s, lang):
    for a, b in XX_RULES.get(lang, []):
        s = re.sub(a, b, s)
    s = PAREN.sub("", s)
    s = re.sub(r"\s{2,}", " ", s).strip()
    return s[:1].upper() + s[1:] if s[:1].islower() else s


def _fields(s, fix):
    """apply fix() to the title, the descriptive meta tags and the lead/answer paragraph"""
    s = re.sub(r"<title>(.*?)</title>", lambda m: "<title>" + fix(m.group(1)) + "</title>", s, count=1, flags=re.S)
    s = re.sub(r'(<meta (?:name|property)="(?:description|og:title|og:description|twitter:title|twitter:description)" content=")([^"]*)(")',
               lambda m: m.group(1) + fix(m.group(2)) + m.group(3), s)
    s = re.sub(r'(<p class="(?:lead|answer)">)(.*?)(</p>)', lambda m: m.group(1) + fix(m.group(2)) + m.group(3), s, count=1, flags=re.S)
    return s


LD = re.compile(r'(<script type="application/ld\+json">)(.*?)(</script>)', re.S)
DIGIT_ANSWER = re.compile(r"^\s*\d")


def _ld(s, fix):
    def one(m):
        try:
            g = json.loads(m.group(2))
        except Exception:
            return m.group(0)

        def walk(o):
            if isinstance(o, dict):
                if o.get("@type") == "FAQPage" and isinstance(o.get("mainEntity"), list):
                    o["mainEntity"] = [q for q in o["mainEntity"]
                                       if not DIGIT_ANSWER.match(str((q.get("acceptedAnswer") or {}).get("text", "")))]
                for k, v in list(o.items()):
                    if isinstance(v, str) and k in ("description", "text") and re.search(r"\d", v):
                        o[k] = fix(v)
                    else:
                        walk(v)
            elif isinstance(o, list):
                for x in o:
                    walk(x)
        before = json.dumps(g, ensure_ascii=False, sort_keys=True)
        walk(g)
        if json.dumps(g, ensure_ascii=False, sort_keys=True) == before:
            return m.group(0)
        return m.group(1) + json.dumps(g, ensure_ascii=False).replace("</", "<\\/") + m.group(3)
    return LD.sub(one, s)


STATS = re.compile(r'\s*<div class="stats">(?:<div class="st">.*?</div>)*</div>', re.S)
GHOST_N = re.compile(r'<a class="btn ghost" href="#places">\s*\d+\s*&darr;</a>')
FAQ_PAIR = re.compile(r'\s*<h3>[^<]*</h3>\s*<p>\s*\d[^<]*</p>|\s*<details><summary>[^<]*</summary>\s*<p>\s*\d[^<]*</p>\s*</details>')
TAG = re.compile(r'<p class="tag">(.*?)</p>', re.S)


def _tag(m, kind):
    parts = [p.strip() for p in m.group(1).split("&middot;")]
    if kind == "country" or any(re.search(r"\b(cit(y|ies)|places?)\b", p) for p in parts):
        return ""  # "5 cities · 13 more places": nothing left once the numbers go
    parts = [re.sub(r"^\d+\s+", "", p) for p in parts]
    parts = [p for p in parts if p]
    if not parts:
        return ""
    parts[0] = parts[0][:1].upper() + parts[0][1:]
    return '<p class="tag">' + " &middot; ".join(parts) + "</p>"


def hub_counts(s, lang, kind):
    fix = en_fix if lang == "en" else (lambda x: xx_fix(x, lang))
    s = _fields(s, fix)
    if lang == "en":
        s = en_fix(s)  # sentence-level rules also cover the FAQ, eyebrow and app panel texts
    s = _ld(s, fix)
    s = STATS.sub("", s)
    s = GHOST_N.sub("", s)
    s = re.sub(r'<span class="m">\d+ (?:rehber|guides?)</span>', "", s)  # TR city lists: "Alanya · 2 rehber"
    s = re.sub(r'(<div class="faq">)(.*?)(</div>)', lambda m: m.group(1) + FAQ_PAIR.sub("", m.group(2)) + m.group(3), s, flags=re.S)
    s = TAG.sub(lambda m: _tag(m, kind), s)
    return s


# ------------------------------------------------------------------ 3. EN country city cards
CITY_CARD = re.compile(r'(<a class="hub-card" href="https://lokali\.travel/explore/en/[^/"]+\.html"><span class="hc-head"><b>.*?</b>)'
                       r'<span class="km">[^<]*</span>(</span>)<span class="mp-brief">[^<]*</span>(</a>)')


# Some hubs are named after the area Google gave the guides, not a city ("Pune district", "County
# Galway", "Auckland Region"). They are real places, but not cities, so a list holding one is
# headed "Cities and regions in X" instead of "Cities in X".
AREA = re.compile(r"(?i)\b(?:district|province|county|region|department|territory|commune|state of|prefecture|oblast|governorate|municipality)\b")
CARD_NAME = re.compile(r'<a class="hub-card" href="https://lokali\.travel/explore/en/[^/"]+\.html"><span class="hc-head"><b>(.*?)</b>')


def country_cards(s):
    s = CITY_CARD.sub(r'\1<span class="km"></span>\2<span class="mp-brief"></span>\3', s)
    if any(AREA.search(H.unescape(n)) for n in CARD_NAME.findall(s)):
        s = re.sub(r'(<h2 class="sec"[^>]*>)Cities in ', r"\1Cities and regions in ", s)
    else:  # move-hubs.py renamed the last area hub of this country
        s = re.sub(r'(<h2 class="sec"[^>]*>)Cities and regions in ', r"\1Cities in ", s)
    return s


INDEX_RULES = [  # the explore index (lk_index.py): no city / landmark totals either
    (r"Explore [\d,]+ Cities", "Explore Cities"),
    (r"Free audio guides for [\d,]+ landmarks in [\d,]+ cities\.", "Free audio guides for landmarks in cities around the world."),
    (r'<span class="badge">[\d,]+ cities &middot; [\d,]+ free guides</span>', '<span class="badge">Free audio guides</span>'),
    (r"Search [\d,]+ cities and [\d,]+ landmarks", "Search cities and landmarks"),
    (r"All [\d,]+ cities, A&ndash;Z", "All cities, A&ndash;Z"),
    (r">[\d,]+ free guides<", ">Free guides<"),
    (r'(<a href="https://lokali\.travel/explore/en/[^"]+\.html">[^<]+)<span>\d+</span></a>', r"\1</a>"),  # A-Z list
    (r', "c": \d+\}', "}"),  # hero slides data (never shown, but still a count)
]
SEARCH_JSON = os.path.join(EXP, "search-index.json")  # lk_index.py: city entries said "38 free guides"


def search_json(s):
    return re.sub(r'"s":"[\d,]+ free guides?"', '"s":"Free audio guides"', s)


APPPANEL_META = re.compile(r'<p class="meta">[\d,]+\+ cities &middot; no ticket')  # lk_sys.apppanel, before 2026-11-13

# The Journal (public/blog*, Soro articles + soro-sync.py's CTA). The articles were written with
# "more than 190 cities in 45 languages"; the city total grows every week, the language total is 50+.
BLOG_RULES = [
    (r"<b>Free audio guides, [\d,]+\+? cities</b>", "<b>Free audio guides worldwide</b>"),
    (r"in (?:45|50\+) languages across (?:more than )?[\d,]+\+? cities", "in 50+ languages, in cities around the world"),
    (r"(?:more than )?[\d,]+\+? cities in (?:45|50\+) languages", "cities around the world in 50+ languages"),
    (r"\b45 languages\b", "50+ languages"),
]


def blog(html):
    """Same rule for the Journal: no city totals, languages = 50+. soro-sync.py calls this on every page."""
    for a, b in BLOG_RULES:
        html = re.sub(a, b, html)
    return html


def apply(html, rel):
    lang, kind = lk_listen.where(rel)
    if kind is None:
        return html
    html = APPPANEL_META.sub('<p class="meta">No ticket', html)
    if kind == "index":
        for a, b in INDEX_RULES:
            html = re.sub(a, b, html)
    html = move_verified(html)
    if kind in ("city", "country"):
        html = hub_counts(html, lang, kind)
        if kind == "country" and lang == "en":
            html = country_cards(html)
    return html


def finish(html, rel):
    return apply(lk_listen.apply(html, rel), rel)


# ------------------------------------------------------------------ CLI
if __name__ == "__main__":
    a = sys.argv[1:]
    dry = "--dry-run" in a
    if a and a[0] == "run":
        rels = json.load(open(a[1], encoding="utf-8"))[int(a[2]):int(a[3])]
        st = {"changed": 0, "hubs": 0, "left_counts": 0}
        left = []

        def one(rel):
            p = os.path.join(EXP, rel)
            with open(p, encoding="utf-8", newline="") as fh:
                s = fh.read()
            n = finish(s, rel)
            if n != s and not dry:
                t = p + ".tmp"
                with open(t, "w", encoding="utf-8", newline="") as fh:
                    fh.write(n)
                os.replace(t, p)
            hub = lk_listen.where(rel)[1] in ("city", "country")
            bad = False
            if hub:
                head = re.search(r"<title>(.*?)</title>", n)
                lead = re.search(r'<p class="(?:lead|answer)">(.*?)</p>', n, re.S)
                bad = bool((head and re.search(r"\d", re.sub(r"50\+", "", head.group(1)))) or
                           (lead and re.search(r"\d", re.sub(r"50\+|۴۵", "", lead.group(1)))))
            return rel, n != s, hub, bad
        with ThreadPoolExecutor(16) as ex:
            res = list(ex.map(one, rels))
        for rel, ch, hub, bad in res:
            st["changed"] += ch; st["hubs"] += hub; st["left_counts"] += bad
            if bad:
                left.append(rel)
        print(json.dumps(st), "| slice", a[2], a[3], "| DRY" if dry else "| written")
        if left:
            print("digits left in title/lead:", left[:8])
    elif a and a[0] == "search-json":
        with open(SEARCH_JSON, encoding="utf-8", newline="") as fh:
            s = fh.read()
        n = search_json(s)
        json.loads(n)  # still valid
        if n != s and not dry:
            with open(SEARCH_JSON + ".tmp", "w", encoding="utf-8", newline="") as fh:
                fh.write(n)
            os.replace(SEARCH_JSON + ".tmp", SEARCH_JSON)
        print("search-index.json:", s.count(" free guide"), "->", n.count(" free guide"), "| DRY" if dry else "| written")
    elif a and a[0] == "blog":
        pub = os.path.dirname(EXP)
        paths = [os.path.join(pub, "blog.html")] + [os.path.join(pub, "blog", f) for f in sorted(os.listdir(os.path.join(pub, "blog"))) if f.endswith(".html")]
        ch = 0
        for p in paths:
            with open(p, encoding="utf-8", newline="") as fh:
                s = fh.read()
            n = blog(s)
            if n != s:
                ch += 1
                if not dry:
                    with open(p + ".tmp", "w", encoding="utf-8", newline="") as fh:
                        fh.write(n)
                    os.replace(p + ".tmp", p)
        print(f"blog pages: {len(paths)}, changed: {ch}", "| DRY" if dry else "| written")
    else:
        print(__doc__)
