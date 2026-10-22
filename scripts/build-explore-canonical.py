#!/usr/bin/env python3
"""Build src/lib/exploreCanonical.generated.ts — the lookup the app's
/attraction/$id route uses to point its canonical at the matching static
/explore/ page, or to mark itself noindex when there is none.

Source of truth: the /explore/ pages themselves (their <h1>,
<link rel="canonical"> and robots meta), in every language. Nothing is
invented. A page is a target only if it is self-canonical and indexable;
alias pages (canonical to another page) add their h1 as one more name for
that target. A name that leads to two different attractions (same name in
two cities) is left out, so those app pages fall back to noindex.

Which language version a name points at:
  - the name came from one language only  -> that language's page
    ("sainte sophie" -> fr, a Georgian name -> ka);
  - the same name appears in several languages -> the English page of
    that attraction if there is one ("louvre" is the h1 in de, nl, sv...).

Key normalisation MUST stay identical to exactKey()/looseKey() in
src/lib/exploreCanonical.ts.

Usage:
  python3 scripts/build-explore-canonical.py                 # scan public/explore
  python3 scripts/build-explore-canonical.py --jsonl A [B..] # reuse scan caches
Re-run after adding, merging or noindexing /explore/ attraction pages.
"""
import html, json, os, re, sys, unicodedata
from collections import defaultdict

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXPLORE = os.path.join(REPO, "public", "explore")
OUT = os.path.join(REPO, "src", "lib", "exploreCanonical.generated.ts")
PREFIX = "https://lokali.travel/explore/"
SKIP_TOP = {"assets"}
SKIP_CITY = {"country"}


def scan():
    rows = []
    for lang in sorted(os.listdir(EXPLORE)):
        ld = os.path.join(EXPLORE, lang)
        if lang in SKIP_TOP or not os.path.isdir(ld):
            continue
        for c in sorted(os.listdir(ld)):
            d = os.path.join(ld, c)
            if c in SKIP_CITY or not os.path.isdir(d):
                continue
            for n in sorted(os.listdir(d)):
                if not n.endswith(".html") or n == "index.html":
                    continue
                s = open(os.path.join(d, n), encoding="utf-8", errors="replace").read()
                can = re.search(r'<link rel="canonical" href="([^"]+)"', s)
                h1 = re.search(r"<h1[^>]*>(.*?)</h1>", s, re.S)
                rows.append({
                    "f": "%s/%s/%s" % (lang, c, n),
                    "can": can.group(1) if can else None,
                    "h1": html.unescape(re.sub(r"<[^>]+>", "", h1.group(1))).strip() if h1 else None,
                    "noindex": bool(re.search(r'name="robots"[^>]*noindex', s)),
                })
    return rows


def strip_paren(s):
    t = re.sub(r"\s*\([^()]*\)\s*$", "", s).strip()
    return t if t else s


def exact_key(s):
    s = unicodedata.normalize("NFC", strip_paren(s)).lower()
    return re.sub(r"[\s\-‐-―]+", " ", s).strip()


def loose_key(s):
    s = unicodedata.normalize("NFD", exact_key(s))
    s = "".join(ch for ch in s if not unicodedata.category(ch).startswith("M"))
    s = s.replace("ı", "i")
    s = re.sub(r"['’]", "", s)
    s = "".join(ch if (ch.isalnum() or ch == " ") else " " for ch in s)
    s = " ".join("st" if w == "saint" else w for w in s.split(" ") if w)
    if s.startswith("the "):
        s = s[4:]
    return s


def load():
    if "--jsonl" not in sys.argv:
        return scan()
    rows = []
    for p in sys.argv[sys.argv.index("--jsonl") + 1:]:
        for l in open(p, encoding="utf-8"):
            r = json.loads(l)
            if r["f"].count("/") == 1:  # en-only cache without the language prefix
                r["f"] = "en/" + r["f"]
            rows.append(r)
    return [r for r in rows if r["f"].split("/")[1] not in SKIP_CITY]


def clusters():
    """Union the hreflang groups in sitemap-explore.xml, so the Turkish
    "istanbul/ayasofya" and the English "istanbul/hagia-sophia" count as one
    attraction. Returns find(url) -> cluster id."""
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    sm = open(os.path.join(REPO, "public", "sitemap-explore.xml"), encoding="utf-8").read()
    for block in re.findall(r"<url>(.*?)</url>", sm, re.S):
        loc = re.search(r"<loc>([^<]+)</loc>", block)
        if not loc:
            continue
        a = find(html.unescape(loc.group(1)))
        for h in re.findall(r'hreflang="[^"]+" href="([^"]+)"', block):
            b = find(html.unescape(h))
            if a != b:
                parent[max(a, b)] = min(a, b)
                a = find(a)
    return find


def main():
    rows = load()
    by_f = {r["f"]: r for r in rows}
    find = clusters()

    def ident_of(t):  # t = "lang/city/slug.html"
        return find(PREFIX + t)

    def final(f, seen=()):
        r = by_f.get(f)
        if not r or not r.get("can") or not r["can"].startswith(PREFIX):
            return None
        t = r["can"][len(PREFIX):]
        if t == f:
            return None if r.get("noindex") else f
        if t in seen or len(seen) > 5:
            return None
        return final(t, seen + (f,))

    # every indexable target, by attraction identity (hreflang cluster) and language
    ok = {}
    for r in rows:
        t = final(r["f"])
        if t:
            ok.setdefault(ident_of(t), {})[t.split("/", 1)[0]] = t[:-5]

    exact, loose = defaultdict(set), defaultdict(set)  # key -> {(ident, src_lang)}
    for r in rows:
        t = final(r["f"])
        if not t or not r.get("h1"):
            continue
        src_lang = r["f"].split("/", 1)[0]
        ident = ident_of(t)
        exact[exact_key(r["h1"])].add((ident, src_lang))
        if src_lang == "en":
            loose[loose_key(r["h1"])].add((ident, src_lang))
            if t == r["f"]:  # the page's own slug, e.g. "metekhi-church"
                loose[loose_key(r["f"].rsplit("/", 1)[1][:-5])].add((ident, src_lang))

    def pick(srcs):
        idents = {i for i, _ in srcs}
        if len(idents) != 1:
            return None
        ident = idents.pop()
        langs = {l for _, l in srcs}
        versions = ok.get(ident, {})
        if len(langs) == 1 and next(iter(langs)) in versions:
            return versions[next(iter(langs))]
        # The same spelling in several languages ("knossos" in fr, de, nl…)
        # says nothing about which language the visitor reads; the app page
        # is English-templated, so only an English target is safe. Without
        # one the page is noindexed rather than canonicalised across
        # languages, which Google ignores anyway.
        return versions.get("en")

    E = {k: pick(v) for k, v in exact.items() if k}
    L = {k: pick(v) for k, v in loose.items() if k}
    amb = sorted(k for k, v in E.items() if v is None)
    E = {k: v for k, v in E.items() if v}
    L = {k: v for k, v in L.items() if v}

    targets = sorted(set(E.values()) | set(L.values()))
    idx = {t: i for i, t in enumerate(targets)}

    def obj(d):
        return "{\n" + "".join("  %s: %d,\n" % (json.dumps(k, ensure_ascii=False), idx[v])
                               for k, v in sorted(d.items())) + "}"

    ts = (
        "// GENERATED by scripts/build-explore-canonical.py — do not edit by hand.\n"
        "// Normalised attraction name -> index into TARGETS (an /explore/ page,\n"
        "// \"lang/city/slug\" without .html). Names shared by two or more\n"
        "// attractions are left out on purpose. See src/lib/exploreCanonical.ts.\n"
        "export const TARGETS: string[] = " + json.dumps(targets, ensure_ascii=False, indent=0) + ";\n\n"
        "export const EXACT: Record<string, number> = " + obj(E) + ";\n\n"
        "export const LOOSE: Record<string, number> = " + obj(L) + ";\n"
    )
    tmp = OUT + ".tmp"
    open(tmp, "w", encoding="utf-8", newline="\n").write(ts)
    os.replace(tmp, OUT)
    langs = defaultdict(int)
    for t in targets:
        langs[t.split("/", 1)[0]] += 1
    print("targets", len(targets), "exact", len(E), "loose", len(L), "ambiguous", len(amb),
          "bytes", len(ts.encode()))
    print("targets by lang:", dict(sorted(langs.items(), key=lambda x: -x[1])))
    print("ambiguous:", "; ".join(amb))


if __name__ == "__main__":
    main()
