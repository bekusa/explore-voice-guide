# -*- coding: utf-8 -*-
"""Rebuild held pages (scripts/held-pages.json) from correct guides and release them (2026-11-13).

The held pages told another city's story (getCachedGuide's legacy '' fallback, see
README-lang-pages.md "Held pages"). Their correct guides now exist in cached_guides; this
script rebuilds the pages from them and puts them back into search.

Input: HELD_DATA dir (outside the repo) with
  release.json        which pages, their guide file, Wikidata facts (desc, q, enwiki, web, geo)
                      and the Commons photo with author and licence
  <guide files>       cached_guides payloads (title, script, key_facts, look_for, tips,
                      estimated_duration_seconds), as stored in the database

English pages are rebuilt whole with gen_factory_en.page() (the current EN generator).
The other-language pages (Chiang Mai Old City in hy/ka/zh/zh-cn, older gen.py templates)
are rebuilt in place: story, key facts, look-for, tips, lead, description, FAQ answers that
quoted the old guide, audio minutes, photo. Nothing about a place is written here: every
sentence is the guide's or Wikidata's, as in gen_factory_en.py.

Then, for the released pages: remove them from held-pages.json, drop the noindex tag, add
the hreflang block for the Chiang Mai cluster, add them to sitemap-explore.xml and llms.txt,
and fix the cards other pages show for them (name + photo: rails, hubs, search index).

  HELD_DATA=/path python scripts/rebuild-held.py [--dry-run]
Afterwards: build-explore-canonical.py (the app's /attraction canonical map).
"""
import html, json, os, re, sys, tempfile, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(os.path.dirname(HERE), "public")
EXP = os.path.join(PUB, "explore")
BASE = "https://lokali.travel"
D = os.environ["HELD_DATA"]
DRY = "--dry-run" in sys.argv
R = json.load(open(os.path.join(D, "release.json"), encoding="utf-8"))
TODAY = datetime.date.today().isoformat()
HL = {"zh-cn": "zh-Hans", "zh-tw": "zh-Hant"}


def rd(p):
    with open(p, encoding="utf-8", newline="") as fh:
        return fh.read()


def wr(p, s):
    if DRY:
        return
    t = p + ".tmp"
    with open(t, "w", encoding="utf-8", newline="") as fh:
        fh.write(s)
    os.replace(t, p)


def guide(f):
    return json.load(open(os.path.join(D, f), encoding="utf-8"))


def mins(g):
    return max(1, round((g.get("estimated_duration_seconds") or 0) / 60))


touched = []


def put(rel, s):
    """the page and its folder twin <slug>/index.html"""
    for p in (os.path.join(EXP, rel), os.path.join(EXP, rel[:-5], "index.html")):
        if os.path.exists(p) or p.endswith(rel.replace("/", os.sep)):
            wr(p, s)
            touched.append(os.path.relpath(p, EXP).replace(os.sep, "/"))


# ---------------------------------------------------------------- 1. English pages
def ld_geo(s):
    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', s, re.S):
        try:
            j = json.loads(m.group(1))
        except ValueError:
            continue
        for o in j.get("@graph") or [j]:
            if o.get("@type") == "TouristAttraction" and o.get("geo"):
                return o.get("name"), (float(o["geo"]["latitude"]), float(o["geo"]["longitude"]))
    return None, None


def pool_for(city, skip):
    """nearby candidates: the other indexable EN pages in the same city folder, with their own photo"""
    out = []
    d = os.path.join(EXP, "en", city)
    for f in sorted(os.listdir(d)):
        if not f.endswith(".html") or f"en/{city}/{f}" in skip:
            continue
        s = rd(os.path.join(d, f))[:200000]
        if 'name="robots" content="noindex' in s:
            continue
        can = re.search(r'<link rel="canonical" href="([^"]+)"', s)
        if not can or not can.group(1).endswith(f"/en/{city}/{f}"):
            continue  # alias pages point elsewhere
        name, geo = ld_geo(s)
        img = re.search(r'<meta property="og:image" content="([^"]+)"', s)
        if name and geo and img:
            out.append({"url": f"{BASE}/explore/en/{city}/{f}", "img": html.unescape(img.group(1)), "name": html.unescape(name), "geo": geo})
    return out


held_now = {p["rel"] for p in json.load(open(os.path.join(HERE, "held-pages.json"), encoding="utf-8"))["pages"]}
items, hubs = [], {"city": {}, "country": {}}
for e in R["en"]:
    g = guide(e["guide"])
    slug = e["rel"].split("/")[2][:-5]
    items.append({"title": e["title"], "wname": e.get("wname"), "city": e["city"], "slug": slug, "country": e["country"], "city_disp": e["city_disp"],
                  "cc": e["cc"], "cat": e["cat"], "desc": e.get("desc") or "", "key_facts": g.get("key_facts") or [], "look_for": g.get("look_for") or [],
                  "tips": g.get("tips") or [], "script": g["script"], "dur": g.get("estimated_duration_seconds"), "lat": e["geo"][0], "lng": e["geo"][1],
                  "img": e["photo"]["img"], "card": e["photo"]["card"], "credit": {"artist": e["photo"]["artist"], "lic": e["photo"]["lic"], "page": e["photo"]["page"]},
                  "enwiki": e.get("enwiki"), "q": e.get("q"), "web": e.get("web"), "how": "hub"})
    hubs["city"][e["city"]] = {"name": e["city_disp"]}
    hubs["country"][e["country"]] = e["cslug"]

tmp = tempfile.mkdtemp(prefix="held-")
json.dump(items, open(os.path.join(tmp, "items.json"), "w", encoding="utf-8"), ensure_ascii=False)
json.dump({}, open(os.path.join(tmp, "exist_img.json"), "w"))
json.dump(hubs, open(os.path.join(tmp, "hubs_plan.json"), "w", encoding="utf-8"), ensure_ascii=False)
os.environ["FACTORY_DATA"] = tmp
os.environ["PUB_MONTH"] = R.get("month", "November 2026")
sys.argv = [sys.argv[0], EXP] + sys.argv[1:]
sys.path.insert(0, HERE)
import gen_factory_en as G  # noqa: E402  (reads FACTORY_DATA at import)

for a, e in zip(items, R["en"]):
    h, rep = G.page(a, pool_for(a["city"], held_now))
    h = G.lk_post.finish(h, e["rel"])
    put(e["rel"], h)
    print("EN  ", e["rel"], "|", rep["title"], "| nearby", rep["nearby"], "|", rep["words"], "words")


# ---------------------------------------------------------------- 2. other languages, in place
MIN_RX = {"ka": r"(\d+)( წთ| წუთ)", "zh": r"(\d+)( ?分钟)", "zh-cn": r"(\d+)( ?分钟)", "hy": r"(\d+)( րոպե)"}
SENT_END = re.compile(r"(?<=[.!?։。])\s*")
esc = lambda x: html.escape(x, quote=False)


def chips(s, cls):
    m = re.search(r'(<div class="chips ' + cls + r'">)(.*?)(</div>\s*</section>)', s, re.S)
    if not m:
        return None, []
    return m, [html.unescape(x) for x in re.findall(r"<span>(.*?)</span>", m.group(2), re.S)]


def bare(x):
    return x.strip().rstrip(".։。").strip()


def first_para(script):
    return [p.strip() for p in re.split(r"\n\s*\n", script) if p.strip()][0]


def shrink(t, n=158):
    if len(t) <= n:
        return t
    out = ""
    for x in SENT_END.split(t):
        if len(out) + len(x) + 1 > n:
            break
        out = (out + (" " if out and not out.endswith("。") else "") + x).strip()
    return out or t[: n - 1] + "…"


for e in R["xx"]:
    rel, lang = e["rel"], e["lang"]
    g = guide(e["guide"])
    s = rd(os.path.join(EXP, rel))
    old_imgs = set(re.findall(r'(https://lokaliphotos\.blob\.core\.windows\.net/[^"\s]+)', s))
    # the old guide as the page shows it
    om = re.search(r'(<div class="prose">)(.*?)(</div>)', s, re.S)
    old_paras = [html.unescape(x) for x in re.findall(r"<p>(.*?)</p>", om.group(2), re.S)]
    swaps = []  # (old text, new text) replaced in lead / description / JSON-LD / FAQ
    for cls, key in (("facts", "key_facts"), ("look", "look_for"), ("tips", "tips")):
        m, old = chips(s, cls)
        new = g.get(key) or []
        if not m:
            continue
        item = re.search(r'<div class="item">(.*?)<span>', m.group(2), re.S)
        icon = item.group(1) if item else ""
        body = "\n" + "\n".join(f'<div class="item">{icon}<span>{esc(x)}</span></div>' for x in new) + "\n"
        s = s[: m.start()] + m.group(1) + body + m.group(3) + s[m.end():]
        swaps += [(bare(o), bare(n)) for o, n in zip(old, new) if bare(o)]
    paras = [p.strip() for p in re.split(r"\n\s*\n", g["script"]) if p.strip()]
    om = re.search(r'(<div class="prose">)(.*?)(</div>)', s, re.S)
    s = s[: om.start()] + om.group(1) + "\n" + "\n".join(f"<p>{esc(p)}</p>" for p in paras) + "\n" + om.group(3) + s[om.end():]
    # lead: pages whose lead was the start of the old story get the start of the new one
    lm = re.search(r'<p class="lead">(.*?)</p>', s, re.S)
    lead = html.unescape(lm.group(1))
    if old_paras and bare(lead).startswith(bare(old_paras[0])[:40]):
        new_lead = first_para(g["script"])
        swaps.insert(0, (bare(lead), bare(new_lead)))
        swaps.insert(1, (bare(old_paras[0]), bare(new_lead)))
    new_lead = lead
    for o, n in swaps:
        new_lead = new_lead.replace(o, n)
    s = s[: lm.start()] + f'<p class="lead">{esc(new_lead)}</p>' + s[lm.end():]
    # description / og / JSON-LD / FAQ: the same swaps, as text and as escaped text
    for o, n in swaps:
        for O, N in ((o, n), (esc(o), esc(n)), (html.escape(o), html.escape(n)), (json.dumps(o, ensure_ascii=False)[1:-1], json.dumps(n, ensure_ascii=False)[1:-1])):
            if O and O != N:
                s = s.replace(O, N)
    # meta description: a cut-down copy of the old story start, or (after the swaps) a whole paragraph
    dm = re.search(r'<meta name="description" content="([^"]*)">', s)
    if dm:
        cur = html.unescape(dm.group(1))
        if old_paras and cur[:30] == bare(old_paras[0])[:30]:
            cur = first_para(g["script"])
        if len(cur) > 170 or cur != html.unescape(dm.group(1)):
            nd = html.escape(shrink(cur.rstrip(".")))
            s = s.replace(dm.group(0), f'<meta name="description" content="{nd}">').replace(
                f'<meta property="og:description" content="{dm.group(1)}">', f'<meta property="og:description" content="{nd}">')
    # audio minutes
    s = re.sub(MIN_RX[lang], lambda m: f"{mins(g)}{m.group(2)}", s)
    # photo (+ credit under the hero, like the EN pages)
    ph = e["photo"]
    for o in old_imgs:
        s = s.replace(o, ph["img"])
    if '<p class="credit">' not in s:
        cr = (f'<p class="credit">Photo: <a href="{html.escape(ph["page"])}" rel="nofollow noopener" target="_blank">{esc(ph["artist"] or "Wikimedia Commons contributor")}</a>'
              + (f' &middot; {esc(ph["lic"])}' if ph["lic"] else "") + " &middot; Wikimedia Commons</p>")
        s = re.sub(r"(<section class=\"hero\">.*?</section>)", lambda m: m.group(1) + "\n" + cr, s, count=1, flags=re.S)
    leftover = [w for w in ("Tbilisi", "თბილის", "Թբիլիս", "第比利斯", "Mtkvari", "მტკვ", "Sioni", "სიონ") if w in s]
    s = G.lk_post.finish(s, rel)
    put(rel, s)
    print("XX  ", rel, "| swaps", len(swaps), "| minutes", mins(g), "| left-over old-city words:", leftover or "none")


# ---------------------------------------------------------------- 3. release
released = [e["rel"] for e in R["en"]] + [e["rel"] for e in R["xx"]]
hp = os.path.join(HERE, "held-pages.json")
H = json.load(open(hp, encoding="utf-8"))
H["pages"] = [p for p in H["pages"] if p["rel"] not in released]
if not DRY:
    json.dump(H, open(hp, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("held-pages.json:", len(H["pages"]), "still held:", [p["rel"] for p in H["pages"]])

ROBOTS_NOIDX = re.compile(r'\n?<meta name="robots" content="noindex, follow">')
CANON = re.compile(r'<link rel="canonical" href="([^"]*)">')
cluster = R.get("cluster") or []
urls = {rel: f"{BASE}/explore/{rel}" for rel in released}
block = ""
if len(cluster) > 1:
    lines = [f'<link rel="alternate" hreflang="{HL.get(r.split("/")[0], r.split("/")[0])}" href="{urls[r]}">' for r in cluster]
    xd = urls[cluster[0]]
    block = "\n".join(lines) + f'\n<link rel="alternate" hreflang="x-default" href="{xd}">'
for rel in released:
    p = os.path.join(EXP, rel)
    s = rd(p) if not DRY or os.path.exists(p) else ""
    s = ROBOTS_NOIDX.sub("", s)
    s = re.sub(r'<link rel="alternate" hreflang="[^"]+" href="[^"]+"\s*/?>\n?', "", s)
    if rel in cluster and block:
        m = CANON.search(s)
        s = s[: m.end()] + "\n" + block + s[m.end():]
    put(rel, s)

# sitemap + llms.txt
sp = os.path.join(PUB, "sitemap-explore.xml")
sm = rd(sp)
add = []
for rel in released:
    u = urls[rel]
    if f"<loc>{u}</loc>" in sm:
        continue
    x = [f"  <url>", f"    <loc>{u}</loc>", f"    <lastmod>{TODAY}</lastmod>", "    <changefreq>monthly</changefreq>", "    <priority>0.7</priority>"]
    if rel in cluster and len(cluster) > 1:
        x += [f'    <xhtml:link rel="alternate" hreflang="{HL.get(r.split("/")[0], r.split("/")[0])}" href="{urls[r]}"/>' for r in cluster]
        x.append(f'    <xhtml:link rel="alternate" hreflang="x-default" href="{urls[cluster[0]]}"/>')
    x.append("  </url>")
    add.append("\n".join(x) + "\n")
if add:
    i = sm.rindex("</urlset>")
    wr(sp, sm[:i] + "".join(add) + sm[i:])
print("sitemap: +", len(add))
lp = os.path.join(PUB, "llms.txt")
ll = rd(lp)
hm = re.search(r"## Canonical URLs \((\d+) total\)\n", ll)
have = set(ll.split("\n"))
new_lines = [urls[r] for r in released if urls[r] not in have]
if hm and new_lines:
    # append at the end of the URL list (the list runs to the end of the file or the next heading)
    nxt = ll.find("\n## ", hm.end())
    end = nxt if nxt != -1 else len(ll.rstrip("\n"))
    ll2 = ll[:end].rstrip("\n") + "\n" + "\n".join(new_lines) + ll[end:]
    n = sum(1 for l in ll2[hm.end():].split("\n") if l.startswith(f"{BASE}/"))
    hm2 = re.search(r"## Canonical URLs \((\d+) total\)\n", ll2)
    ll2 = ll2[:hm2.start()] + f"## Canonical URLs ({n} total)\n" + ll2[hm2.end():]
    wr(lp, ll2)
print("llms.txt: +", len(new_lines))

# ---------------------------------------------------------------- 4. cards on other pages
# rails ("More to see"), city/country hubs and the explore index show each page with a name and
# a photo; both came from the wrong guide era. Point them at the new name and Commons photo.
fix = {}
for e in R["en"]:
    fix[urls[e["rel"]]] = (e["title"], e["photo"]["card"])
files = set()
for e in R["en"]:
    city = e["rel"].split("/")[1]
    d = os.path.join(EXP, "en", city)
    files |= {os.path.join(d, f) for f in os.listdir(d) if f.endswith(".html")}
    files |= {os.path.join(d, f, "index.html") for f in os.listdir(d) if os.path.isdir(os.path.join(d, f))}
    files.add(os.path.join(EXP, "en", city + ".html"))
    files.add(os.path.join(EXP, "en", "country", e["cslug"] + ".html"))
files.add(os.path.join(EXP, "index.html"))
own = {os.path.join(EXP, r) for r in released} | {os.path.join(EXP, r[:-5], "index.html") for r in released}
nfix = 0
for p in sorted(files - own):
    if not os.path.exists(p):
        continue
    s = rd(p)
    n = s
    for u, (name, card) in fix.items():
        if u not in n:
            continue
        uq = re.escape(u)
        n = re.sub(r'(<a class="(?:pcard|icard|hub-card)[^"]*" href="' + uq + r'"[^>]*>)(.*?)(</a>)',
                   lambda m: m.group(1) + re.sub(r'(<img src=")[^"]*(")', lambda k: k.group(1) + card + k.group(2),
                                                 re.sub(r'(alt=")[^"]*(")', lambda k: k.group(1) + html.escape(name) + k.group(2),
                                                        re.sub(r"(<b>)[^<]*(</b>)", lambda k: k.group(1) + esc(name) + k.group(2), m.group(2), count=1))) + m.group(3),
                   n, flags=re.S)
        n = re.sub(r'("name": )"[^"]*"(, "url": "' + uq + r'")', lambda m: m.group(1) + json.dumps(name, ensure_ascii=False) + m.group(2), n)
    if n != s:
        nfix += 1
        wr(p, n)
        touched.append(os.path.relpath(p, EXP).replace(os.sep, "/"))
si = os.path.join(EXP, "search-index.json")
S = json.load(open(si, encoding="utf-8"))
ns = 0
for x in S:
    if x.get("u") in fix:
        x["t"], x["i"] = fix[x["u"]][0], fix[x["u"]][1]
        ns += 1
if ns and not DRY:
    json.dump(S, open(si, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"cards fixed on {nfix} pages, search-index entries {ns}")

# ---------------------------------------------------------------- 5. the old photo and old name anywhere near them
# City hubs took their hero/og image from these pages, sibling twins list them by the old h1, the
# other-language Chiang Mai hubs show the old photo. release.json "old_img" is the distinctive part
# of the old photo URL (blob hash or Commons file name), "old_name" the wrong h1 if there was one.
scope = {os.path.join(EXP, "index.html")}
for e in R["en"] + R["xx"]:
    lang, city = e["rel"].split("/")[:2]
    scope |= {os.path.join(EXP, lang, city + ".html"), os.path.join(EXP, lang, city, "index.html")}
    d = os.path.join(EXP, lang, city)
    for f in os.listdir(d):
        p = os.path.join(d, f)
        scope.add(p if f.endswith(".html") else os.path.join(p, "index.html"))
    if e.get("cslug"):
        scope |= {os.path.join(EXP, "en", "country", e["cslug"] + ".html"), os.path.join(EXP, "en", "country", e["cslug"], "index.html")}
n5 = 0
for p in sorted(scope):
    if not os.path.isfile(p):
        continue
    s = rd(p)
    n = s
    for e in R["en"] + R["xx"]:
        k = e.get("old_img")
        if k and k in n:
            rx = r'https://[^"\s]*' + re.escape(k) + r'[^"\s]*'
            n = re.sub(r'(<a [^>]*>\s*<img src=")' + rx, lambda m: m.group(1) + e["photo"]["card"], n)  # cards: the 500px copy
            n = re.sub(rx, e["photo"]["img"], n)  # hero, og:image, JSON-LD
        if e.get("old_name"):
            u = re.escape(urls[e["rel"]])
            title = e.get("title") or e["old_name"]
            n = re.sub(r'(<a [^>]*href="' + u + r'"[^>]*>)' + re.escape(esc(e["old_name"])) + r"(?=<)", lambda m: m.group(1) + esc(title), n)
    if n != s:
        n5 += 1
        wr(p, n)
        touched.append(os.path.relpath(p, EXP).replace(os.sep, "/"))
S = json.load(open(si, encoding="utf-8"))
for x in S:
    for e in R["en"] + R["xx"]:
        if e.get("old_img") and e["old_img"] in (x.get("i") or ""):
            x["i"] = e["photo"]["card"]
if not DRY:
    json.dump(S, open(si, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"old photo / name replaced on {n5} more pages")
print("files written:" if not DRY else "DRY RUN, would write:", len(set(touched)))
