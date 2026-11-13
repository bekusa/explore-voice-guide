# -*- coding: utf-8 -*-
"""Keep listed /explore/ pages out of search while their content is wrong.

WHY (2026-11-10). Beka found that /explore/en/chiang-mai/old-city.html (and its
zh-cn version) tells the story of Tbilisi's Old Town. Cause: getCachedGuide()
falls back to the legacy '' city bucket, so a generic name such as "old city"
returned another city's guide when the pages were built. The cache rows were
moved to their real cities the same day; the pages stay up but out of the index
until a correct guide exists. The list lives in scripts/held-pages.json.

What it does (idempotent, safe to re-run):
  1. every held page (and its folder twin <slug>/index.html, if one exists) gets
     <meta name="robots" content="noindex, follow"> right after its canonical and
     loses its <link rel="alternate"> block -- the shape link-langs.py gives every
     noindexed page;
  2. sibling pages drop hreflang lines that point at a held page;
  3. sitemap-explore.xml and llms.txt drop the held URLs. With --prune it also
     drops every sitemap URL whose page is noindex or names another page as its
     canonical (link-langs.py kept the canonical-aliased ones in until
     2026-11-10; it no longer does).

link-langs.py honours the noindex tag, so a later full run keeps these pages
out. A generator that rewrites a held page must be followed by this script.
To release a page: remove it from held-pages.json, regenerate the page from a
correct guide, then run link-langs.py and build-explore-canonical.py.

  python scripts/hold-pages.py --dry-run [--prune]
  python scripts/hold-pages.py [--prune]
"""
import html, json, os, re, sys
import urllib.parse as up
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(os.path.dirname(HERE), "public")
EXP = os.path.join(PUB, "explore")
BASE = "https://lokali.travel"
DRY = "--dry-run" in sys.argv
PRUNE = "--prune" in sys.argv

ROBOTS = '<meta name="robots" content="noindex, follow">'
CANON = re.compile(r'<link rel="canonical" href="([^"]*)">')
ROBOTS_ANY = re.compile(r'<meta name="robots" content="[^"]*">\n?')
ALT_LINE = re.compile(r'<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"\s*/?>\n?')


def norm(u):
    u = html.unescape(u)
    try:
        return up.unquote(u)
    except Exception:
        return u


def rd(path):
    # newline='' keeps the files' \n line endings intact on Windows
    with open(path, encoding="utf-8", newline="") as fh:
        return fh.read()


def wr(path, text):
    """temp file + os.replace, so a killed run never leaves a half-written page"""
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as fh:
        fh.write(text)
    os.replace(tmp, path)


held = [p["rel"] for p in json.load(open(os.path.join(HERE, "held-pages.json"), encoding="utf-8"))["pages"]]
held_urls = {f"{BASE}/explore/{r}" for r in held}
changed = []

# ------------------------------------------------------------ 1. the held pages
siblings = set()
for rel in held:
    path = os.path.join(EXP, rel)
    if not os.path.exists(path):
        print("  ! missing", rel)
        continue
    s = rd(path)
    for hl, href in ALT_LINE.findall(s):
        t = norm(href)
        if t.startswith(f"{BASE}/explore/") and t not in held_urls:
            siblings.add(t[len(f"{BASE}/explore/"):])
    new = ALT_LINE.sub("", s)
    if 'name="robots" content="noindex' not in new:
        new = ROBOTS_ANY.sub("", new)
        m = CANON.search(new)
        if not m:
            print("  ! no canonical, left alone:", rel)
            continue
        new = new[:m.end()] + "\n" + ROBOTS + new[m.end():]
    for p in (path, os.path.join(EXP, rel[:-5], "index.html")):
        if os.path.exists(p) and rd(p) != new:
            changed.append(p)
            if not DRY:
                wr(p, new)

# ------------------------------------------- 2. siblings that still point at them
for rel in sorted(siblings):
    path = os.path.join(EXP, rel)
    if not os.path.exists(path):
        continue
    s = rd(path)
    alts = ALT_LINE.findall(s)
    keep = [(hl, href) for hl, href in alts if norm(href) not in held_urls]
    if len(keep) == len(alts):
        continue
    langs = [(hl, href) for hl, href in keep if hl != "x-default"]
    if len(langs) < 2:
        block = ""  # a group of one carries no hreflang (link-langs.py rule)
    else:
        xd = dict(langs).get("en") or langs[0][1]
        block = "\n".join(f'<link rel="alternate" hreflang="{hl}" href="{href}">' for hl, href in langs)
        block += f'\n<link rel="alternate" hreflang="x-default" href="{xd}">'
    new = ALT_LINE.sub("", s)
    if block:
        m = CANON.search(new)
        new = new[:m.end()] + "\n" + block + new[m.end():]
    changed.append(path)
    if not DRY:
        wr(path, new)

# ------------------------------------------------------- 3. sitemap + llms.txt
sp = os.path.join(PUB, "sitemap-explore.xml")
sm = rd(sp)
blocks = re.findall(r"  <url>.*?</url>\n", sm, re.S)
drop = set(held_urls)
# --also-drop FILE: sitemap URLs found by an earlier --prune-style scan (one per
# line), for when reading the whole tree does not fit in one run.
if "--also-drop" in sys.argv:
    for l in open(sys.argv[sys.argv.index("--also-drop") + 1], encoding="utf-8"):
        if l.strip():
            drop.add(norm(l.strip()))

if PRUNE:
    LOC = re.compile(r"<loc>([^<]+)</loc>")
    NOIDX = re.compile(r'<meta[^>]+name="robots"[^>]+content="[^"]*noindex', re.I)

    def bad(loc):
        u = norm(loc)
        if not u.startswith(f"{BASE}/explore/"):
            return None
        p = os.path.join(EXP, u[len(f"{BASE}/explore/"):])
        if not os.path.exists(p):
            return u, "missing"
        with open(p, encoding="utf-8", errors="ignore") as fh:
            h = fh.read(16000)
        if NOIDX.search(h):
            return u, "noindex"
        m = CANON.search(h)
        if m and norm(m.group(1)) != u:
            return u, "canonical -> " + norm(m.group(1))
        return None

    locs = [LOC.search(b).group(1) for b in blocks if LOC.search(b)]
    with ThreadPoolExecutor(32) as ex:
        found = [x for x in ex.map(bad, locs) if x]
    for u, why in sorted(found):
        if u not in drop:
            print("  prune:", u, "|", why)
        drop.add(u)

out, removed = [], []
for b in blocks:
    loc = norm(re.search(r"<loc>([^<]+)</loc>", b).group(1))
    if loc in drop:
        removed.append(loc)
        continue
    lines = b.split("\n")
    kept = [l for l in lines if not (l.strip().startswith("<xhtml:link")
                                     and norm(re.search(r'href="([^"]+)"', l).group(1)) in drop)]
    if len(kept) != len(lines):
        if sum(1 for l in kept if "<xhtml:link" in l and 'hreflang="x-default"' not in l) < 2:
            kept = [l for l in kept if "<xhtml:link" not in l]
    out.append("\n".join(kept))
head = sm[: sm.index("  <url>")]
tail = sm[sm.rindex("</url>\n") + len("</url>\n"):]
new_sm = head + "".join(out) + tail
print(f"sitemap: {len(blocks)} -> {len(out)} urls ({len(removed)} removed)")

lp = os.path.join(PUB, "llms.txt")
ll = rd(lp)
new_ll = "\n".join(l for l in ll.split("\n") if norm(l.strip()) not in drop)
hm = re.search(r"## Canonical URLs \((\d+) total\)\n", new_ll)
if hm:  # the count covers the URL list under that heading (link-langs.py: len(allu))
    n = sum(1 for l in new_ll[hm.end():].split("\n") if l.startswith(f"{BASE}/"))
    new_ll = new_ll[:hm.start()] + f"## Canonical URLs ({n} total)\n" + new_ll[hm.end():]

print(f"pages changed: {len(changed)}")
for p in changed:
    print("  ", os.path.relpath(p, EXP).replace(os.sep, "/"))
if DRY:
    print("DRY RUN -- nothing written")
else:
    if new_sm != sm:
        wr(sp, new_sm)
    if new_ll != ll:
        wr(lp, new_ll)
    print("written")
