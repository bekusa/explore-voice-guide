# -*- coding: utf-8 -*-
"""Rename or merge /explore/en/ city hubs that were named after an area, not a city (Beka 2026-11-13).

Some hubs carry the area the geocoder gave the guides ("Auckland Region", "Orange County",
"City of London", "Central District", "Commune de Grand-Bassam"). Where the places really belong
to a city, the hub is renamed or merged into that city; real regions whose places are spread far
apart (Northern Territory, County Galway, Almaty Region...) stay regions, and lk_post.py heads their
country list "Cities and regions in X".

For every move this script:
  1. writes each attraction page (and its folder twin) under the new city with paths, the hub name
     and the "near/in <hub>" wording changed, and moves the old files to _to_delete/ (no deletes);
  2. renames the hub page, or appends its cards to the target hub and moves it to _to_delete/;
  3. rewrites links to the old URLs on every other EN page, the country hub, the explore index and
     search-index.json, sitemap-explore.xml and llms.txt;
  4. prints the CITY_FIX / HUB_FIX lines for src/routes/explore.$.tsx (the 301s) - they are added
     there by hand, next to the 2026-10 city corrections.
Afterwards: build-explore-canonical.py.

  python scripts/move-hubs.py [--dry-run]
"""
import html, json, os, re, shutil, sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
PUB = os.path.join(REPO, "public")
EXP = os.path.join(PUB, "explore")
EN = os.path.join(EXP, "en")
TRASH = os.path.join(REPO, "_to_delete", "move-hubs-2026-11-14")
BASE = "https://lokali.travel/explore/en/"
DRY = "--dry-run" in sys.argv

# from-hub -> to-hub, display names. "split" sends single pages to different cities; "hub": False =
# that city has no hub page (fewer than three guides), so the page links to its country instead.
MOVES = [
    {"from": "auckland-region", "to": "auckland", "old": "Auckland Region", "new": "Auckland", "kind": "rename"},
    {"from": "commune-de-grand-bassam", "to": "grand-bassam", "old": "Commune de Grand-Bassam", "new": "Grand-Bassam", "kind": "rename"},
    {"from": "city-of-london", "to": "greater-london", "old": "City of London", "new": "London", "kind": "merge"},
    {"from": "orange-county", "to": "orlando", "old": "Orange County", "new": "Orlando", "kind": "merge"},
    {"from": "central-district-iran", "old": "Central District", "kind": "split", "country": "iran", "country_name": "Iran",
     "split": {"bishapur": ("shiraz", "Shiraz", True), "jamkaran-mosque": ("qom", "Qom", False), "rudkhan-castle": ("rasht", "Rasht", True)}},
]


def rd(p):
    with open(p, encoding="utf-8", newline="") as fh:
        return fh.read()


def wr(p, s):
    if DRY:
        return
    os.makedirs(os.path.dirname(p), exist_ok=True)
    t = p + ".tmp"
    with open(t, "w", encoding="utf-8", newline="") as fh:
        fh.write(s)
    os.replace(t, p)


def trash(p):
    if DRY or not os.path.exists(p):
        return
    dst = os.path.join(TRASH, os.path.relpath(p, PUB))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.move(p, dst)


GUIDE_PARTS = re.compile(r'<div class="prose">.*?</div>|<div class="chips [a-z]+">.*?</div>\s*</section>', re.S)


def rename_name(s, old, new):
    """The hub's name in the page frame (title, breadcrumb, "near X", rail heading, FAQ "Where is").
    The guide itself (story, key facts, look-for, tips) is left exactly as written: "the City of
    London" or "Orange County, Florida" there are facts about the place, not the hub's name."""
    keep = {}

    def hide(m):
        k = f"\x00{len(keep)}\x00"
        keep[k] = m.group(0)
        return k
    s = GUIDE_PARTS.sub(hide, s)
    s = re.sub(r"(?<![Tt]he )" + re.escape(old), new, s)
    for k, v in keep.items():
        s = s.replace(k, v)
    return s


url_map = {}   # old absolute URL -> new absolute URL (pages and hubs)
fix_lines, hub_fix = [], []
moved_rels = {}  # old rel -> new rel
report = []

for M in MOVES:
    src_dir = os.path.join(EN, M["from"])
    pages = sorted(f[:-5] for f in os.listdir(src_dir) if f.endswith(".html") and f != "index.html")  # index.html = the hub's twin
    for slug in pages:
        if M["kind"] == "split":
            to, new_name, has_hub = M["split"][slug]
        else:
            to, new_name, has_hub = M["to"], M["new"], True
        old_rel, new_rel = f"en/{M['from']}/{slug}.html", f"en/{to}/{slug}.html"
        s = rd(os.path.join(EXP, old_rel))
        n = s.replace(f"/explore/en/{M['from']}/", f"/explore/en/{to}/")
        n = n.replace(f"utm_content={M['from']}", f"utm_content={to}")
        if has_hub:
            n = n.replace(f"/explore/en/{M['from']}.html", f"/explore/en/{to}.html")
            n = rename_name(n, M["old"], new_name)
        else:
            cu = f"https://lokali.travel/explore/en/country/{M['country']}.html"
            hub_u = f"https://lokali.travel/explore/en/{M['from']}.html"
            # breadcrumb: drop the hub step (HTML and JSON-LD), renumber the JSON-LD positions
            n = re.sub(r'<a href="' + re.escape(hub_u) + r'">[^<]*</a> <span class="sep">&rsaquo;</span> ', "", n)
            n = re.sub(r', \{"@type": "ListItem", "position": \d+, "name": "[^"]*", "item": "' + re.escape(hub_u) + r'"\}', "", n)
            def renum(m):
                k = [0]
                return re.sub(r'"position": \d+', lambda _: (k.__setitem__(0, k[0] + 1), f'"position": {k[0]}')[1], m.group(0))
            n = re.sub(r'\{"@type": "BreadcrumbList", "itemListElement": \[.*?\]\}', renum, n, flags=re.S)
            n = re.sub(r'<a class="btn ghost" href="' + re.escape(hub_u) + r'">[^<]*</a>', f'<a class="btn ghost" href="{cu}">{M["country_name"]} &rarr;</a>', n)
            n = re.sub(r'<a class="seeall" href="' + re.escape(hub_u) + r'">[^<]*</a>', "", n)
            n = re.sub(r' &middot; <a href="' + re.escape(hub_u) + r'">[^<]*</a>', "", n)
            n = rename_name(n, M["old"], new_name)
        new_path = os.path.join(EXP, new_rel)
        if os.path.exists(new_path):
            raise SystemExit(f"target exists, refusing to overwrite: {new_rel}")
        wr(new_path, n)
        twin_old = os.path.join(EXP, old_rel[:-5], "index.html")
        if os.path.exists(twin_old):
            wr(os.path.join(EXP, new_rel[:-5], "index.html"), n)
        url_map[BASE + f"{M['from']}/{slug}.html"] = BASE + f"{to}/{slug}.html"
        moved_rels[old_rel] = new_rel
        fix_lines.append(f'  "{M["from"]}/{slug}": "{to}/{slug}",')
        report.append(f"page  {old_rel} -> {new_rel}")

    # ---- the hub page
    hub_old = os.path.join(EN, M["from"] + ".html")
    hs = rd(hub_old)
    if M["kind"] == "rename":
        n = hs.replace(f"/explore/en/{M['from']}/", f"/explore/en/{M['to']}/").replace(f"/explore/en/{M['from']}.html", f"/explore/en/{M['to']}.html")
        n = n.replace(f"utm_content={M['from']}", f"utm_content={M['to']}")
        n = rename_name(n, M["old"], M["new"])
        for p in (os.path.join(EN, M["to"] + ".html"), os.path.join(EN, M["to"], "index.html")):
            if os.path.exists(p) and p.endswith(".html") and not p.endswith("index.html"):
                raise SystemExit(f"target hub exists: {p}")
        wr(os.path.join(EN, M["to"] + ".html"), n)
        if os.path.exists(os.path.join(src_dir, "index.html")):
            wr(os.path.join(EN, M["to"], "index.html"), n)
        url_map[BASE + M["from"] + ".html"] = BASE + M["to"] + ".html"
        hub_fix.append(f'  "{M["from"]}": "{M["to"]}",')
        report.append(f"hub   en/{M['from']}.html -> en/{M['to']}.html (renamed)")
    else:
        cards = re.findall(r'<a class="icard" href="[^"]+">.*?</a>(?=<a class="icard"|</div>)', hs, re.S)
        items = re.findall(r'\{"@type": "ListItem", "position": \d+, "name": "[^"]*", "url": "[^"]+"\}', hs)
        targets = {}
        for c in cards:
            u = re.search(r'href="([^"]+)"', c).group(1)
            slug = u.rsplit("/", 1)[1][:-5]
            to, tname, has_hub = (M["split"][slug] if M["kind"] == "split" else (M["to"], M["new"], True))
            if has_hub:
                targets.setdefault(to, {"cards": [], "items": []})["cards"].append(c.replace(f"/explore/en/{M['from']}/", f"/explore/en/{to}/"))
        for it in items:
            u = re.search(r'"url": "([^"]+)"', it).group(1)
            slug = u.rsplit("/", 1)[1][:-5]
            to, tname, has_hub = (M["split"][slug] if M["kind"] == "split" else (M["to"], M["new"], True))
            if has_hub:
                targets.setdefault(to, {"cards": [], "items": []})["items"].append(it.replace(f"/explore/en/{M['from']}/", f"/explore/en/{to}/"))
        for to, add in targets.items():
            for tp in (os.path.join(EN, to + ".html"), os.path.join(EN, to, "index.html")):
                if not os.path.exists(tp):
                    continue
                t = rd(tp)
                g = re.search(r'(<section id="places">.*?<div class="grid">)(.*?)(</div></section>)', t, re.S)
                have = len(re.findall(r'<a class="icard"', g.group(2)))
                new_cards = []
                for i, c in enumerate(add["cards"]):
                    new_cards.append(re.sub(r'<span class="rk">#\d+</span>', f'<span class="rk">#{have + i + 1}</span>', c))
                t = t[: g.end(2)] + "".join(new_cards) + t[g.end(2):]
                il = re.search(r'("@type": "ItemList", "name": "[^"]*", "numberOfItems": )(\d+)(, "itemListElement": \[)(.*?)(\]\})', t, re.S)
                if il:
                    cnt = int(il.group(2))
                    extra = []
                    for i, it in enumerate(add["items"]):
                        extra.append(re.sub(r'"position": \d+', f'"position": {cnt + i + 1}', it))
                    t = t[: il.start(2)] + str(cnt + len(extra)) + il.group(3) + il.group(4) + "".join(", " + x for x in extra) + il.group(5) + t[il.end():]
                wr(tp, t)
            report.append(f"hub   en/{M['from']}.html cards -> en/{to}.html (+{len(add['cards'])})")
        dest = f"country/{M['country']}" if M["kind"] == "split" else M["to"]
        url_map[BASE + M["from"] + ".html"] = BASE + dest + ".html"
        hub_fix.append(f'  "{M["from"]}": "{dest}",')
        report.append(f"hub   en/{M['from']}.html -> 301 en/{dest}.html")

# ---- move the old files out of public/
for M in MOVES:
    for f in sorted(os.listdir(os.path.join(EN, M["from"]))):
        p = os.path.join(EN, M["from"], f)
        trash(p)
    if not DRY and os.path.isdir(os.path.join(EN, M["from"])) and not os.listdir(os.path.join(EN, M["from"])):
        os.rmdir(os.path.join(EN, M["from"]))  # the now-empty folder (its files are in _to_delete)
    trash(os.path.join(EN, M["from"] + ".html"))

# ---- 3. every other page that links to an old URL
def norm_variants(u):
    from urllib.parse import quote
    q = quote(u, safe=":/")
    return {u, q} | ({u.replace("ã", "%C3%A3")} if "ã" in u else set())

pairs = []
for o, nw in url_map.items():
    for v in norm_variants(o):
        pairs.append((v, nw))
names = {M["from"]: M for M in MOVES}
files = []
if os.environ.get("MOVE_LINKS"):
    # the pages that link to an old URL, found beforehand with ripgrep (walking the whole tree
    # on the synced folder is too slow): one path per line, relative to public/explore
    for l in open(os.environ["MOVE_LINKS"], encoding="utf-8"):
        p = os.path.join(EXP, l.strip().replace("/", os.sep))
        if l.strip() and os.path.isfile(p):
            files.append(p)
else:
    for root, dirs, fs in os.walk(EN):
        for f in fs:
            if f.endswith(".html"):
                files.append(os.path.join(root, f))
files.append(os.path.join(EXP, "index.html"))


def fix(p):
    s = rd(p)
    if "/explore/en/" not in s:
        return 0
    hit = [x for x in MOVES if f"/explore/en/{x['from']}" in s]
    if not hit:
        return 0
    n = s
    for o, nw in pairs:
        n = n.replace(o, nw)
    for M in hit:
        # cards / links that showed the hub by its old name
        if M["kind"] == "rename":
            n = n.replace(f'>{html.escape(M["old"], quote=False)}<', f'>{html.escape(M["new"], quote=False)}<')
            n = n.replace(f'"name": "{M["old"]}"', f'"name": "{M["new"]}"')
        else:
            # a merged hub disappears from country lists and the index
            hu = BASE + (f"country/{M['country']}" if M["kind"] == "split" else M["to"]) + ".html"
            n = re.sub(r'\n?<a class="hub-card" href="' + re.escape(hu) + r'"><span class="hc-head"><b>' + re.escape(html.escape(M["old"], quote=False)) + r'</b>.*?</a>', "", n, flags=re.S)
            n = re.sub(r'<a href="' + re.escape(hu) + r'">' + re.escape(html.escape(M["old"], quote=False)) + r"</a>", "", n)
            n = re.sub(r', \{"@type": "(?:City|Place|ListItem)"[^{}]*"name": "' + re.escape(M["old"]) + r'"[^{}]*\}', "", n)
    if n != s:
        wr(p, n)
        return 1
    return 0


with ThreadPoolExecutor(32) as ex:
    changed = sum(ex.map(fix, files))
report.append(f"links rewritten on {changed} pages")

si = os.path.join(EXP, "search-index.json")
S = json.load(open(si, encoding="utf-8"))
out = []
for x in S:
    u = x.get("u")
    if u in url_map:
        if x.get("k") == "City" and (url_map[u].endswith("/country/iran.html") or any(M["kind"] == "merge" and u == BASE + M["from"] + ".html" for M in MOVES)):
            continue  # merged hub: its places are found under the city they joined
        x["u"] = url_map[u]
        for M in MOVES:
            if M["kind"] == "rename" and x.get("t") == M["old"]:
                x["t"] = M["new"]
            x["s"] = (x.get("s") or "").replace(M["old"], M.get("new") or M["old"])
    out.append(x)
for x in out:
    for M in MOVES:
        if M["kind"] == "split" and M["old"] in (x.get("s") or ""):
            slug = x["u"].rsplit("/", 1)[1][:-5]
            if slug in M["split"]:
                x["s"] = x["s"].replace(M["old"], M["split"][slug][1])
if not DRY:
    json.dump(out, open(si, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
report.append(f"search-index: {len(S)} -> {len(out)}")

# ---- sitemap + llms.txt
sp = os.path.join(PUB, "sitemap-explore.xml")
sm = rd(sp)
blocks = re.findall(r"  <url>.*?</url>\n", sm, re.S)
nb = []
for b in blocks:
    loc = re.search(r"<loc>([^<]+)</loc>", b).group(1)
    if loc in url_map:
        tgt = url_map[loc]
        if tgt.endswith("/country/iran.html") or any(M["kind"] == "merge" and loc == BASE + M["from"] + ".html" for M in MOVES):
            continue
        b = b.replace(loc, tgt)
    nb.append(b)
head = sm[: sm.index("  <url>")]
tail = sm[sm.rindex("</url>\n") + len("</url>\n"):]
wr(sp, head + "".join(nb) + tail)
report.append(f"sitemap: {len(blocks)} -> {len(nb)}")
lp = os.path.join(PUB, "llms.txt")
ll = rd(lp)
lines = []
for l in ll.split("\n"):
    if l in url_map:
        tgt = url_map[l]
        if tgt.endswith("/country/iran.html") or any(M["kind"] == "merge" and l == BASE + M["from"] + ".html" for M in MOVES):
            continue
        l = tgt
    lines.append(l)
ll2 = "\n".join(lines)
hm = re.search(r"## Canonical URLs \((\d+) total\)\n", ll2)
if hm:
    n = sum(1 for l in ll2[hm.end():].split("\n") if l.startswith("https://lokali.travel/"))
    ll2 = ll2[:hm.start()] + f"## Canonical URLs ({n} total)\n" + ll2[hm.end():]
wr(lp, ll2)

json.dump({"url_map": url_map, "moved_rels": moved_rels}, open(os.path.join(HERE, "..", "_to_delete", "move-hubs-2026-11-14.map.json") if not DRY else os.devnull, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("\n".join(report))
print("\n// CITY_FIX additions (src/routes/explore.$.tsx):\n" + "\n".join(fix_lines))
print("\n// HUB_FIX (new map):\n" + "\n".join(hub_fix))
print("DRY RUN" if DRY else "written")
