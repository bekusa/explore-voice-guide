import json, os, sys, unicodedata, collections
sys.path.insert(0, os.path.dirname(__file__))
from lk_sys import *

PUB = sys.argv[1]                      # .../public
OUT = sys.argv[2]                      # output html
PREVIEW = "--preview" in sys.argv

attr = json.load(open("/tmp/rd/attr.json"))
cities = json.load(open("/tmp/rd/cities.json"))
cname = {c["slug"]: c["name"] for c in cities}
ccount = {c["slug"]: c["n"] for c in cities}
FALLBACK = "images/museums/louvre.jpg"
attr = [a for a in attr if a["city"] in cname and (FALLBACK not in a["img"] or "louvre" in a["name"].lower())]

def city_photo(slug):
    p = f"{PUB}/images/cities/{slug}.jpg"
    if os.path.exists(p): return f"{SITE}/images/cities/{slug}.jpg"
    best = sorted([a for a in attr if a["city"] == slug], key=lambda a: -a["min"])
    return best[0]["img"] if best else ""

# ---------- hero slides (real city photos used on the app home) ----------
SLIDES = [
 ("istanbul", "Byzantine domes, Ottoman palaces and a city split between two continents."),
 ("rome",     "Roman Forum ruins, baroque fountains and dinner tables in Trastevere."),
 ("tbilisi",  "Sulfur baths, carved wooden balconies and the bells of Sioni Cathedral."),
 ("bangkok",  "Gilded temples, river ferries and night markets along the Chao Phraya."),
 ("paris",    "The Louvre, the steps of Montmartre and the quays of the Seine."),
]

# ---------- themed rails ----------
# Each rail leads with world-famous places (an editorial choice - there is no
# trustworthy global popularity signal: cached_guides.hit_count is flattened by
# cache warming, ~134 on every Turkish row), then fills by type.
THEMES = [
 ("Ancient <em>wonders</em>", "Ruins, tombs and the places empires left behind",
  {"Archaeological Site","Historic Site","Mausoleum","Historic Town","Ruins"},
  ["colosseum","roman forum","treasury","petra","ephesus",
   "gobekli tepe","terracotta army","pantheon","pompeii","mount nemrut","pamukkale","persepolis",
   "angkor wat","chichen itza","teotihuacan","machu picchu"]),
 ("Great <em>museums</em>", "Collections that define a civilisation", {"Museum"},
  ["louvre museum","prado museum","uffizi gallery","musee d'orsay","british museum","metropolitan museum","vatican museums","uffizi","rijksmuseum",
   "hermitage museum","orsay","grand egyptian","acropolis museum","istanbul archaeology"]),
 ("Sacred <em>places</em>", "Mosques, cathedrals, temples and shrines",
  {"Temple","Cathedral","Church","Mosque","Monastery","Shrine"},
  ["hagia sophia","ayasofya","blue mosque","sagrada familia","st. peter's basilica","notre-dame de paris","notre-dame cathedral","sheikh zayed",
   "wat arun","wat pho","senso-ji","fushimi inari","saint basil","sioni cathedral","temple of heaven","golden temple"]),
 ("Palaces &amp; <em>castles</em>", "Where the powerful lived, and defended it",
  {"Palace","Castle","Fort","Fortress"},
  ["topkapi","alhambra","versailles","forbidden city","neuschwanstein","grand palace","prague castle",
   "dolmabahce","schonbrunn","tower of london","narikala fortress","narikala","edinburgh castle"]),
 ("Old towns <em>on foot</em>", "Neighbourhoods, squares and streets worth wandering",
  {"Neighborhood","Square","Street"},
  ["montmartre","trastevere","gothic quarter","balat","alfama","plaka","le marais","old town square",
   "sultanahmet","piazza navona","grand place"]),
 ("Markets &amp; <em>food</em>", "Where the city shops, eats and argues about prices",
  {"Market","Food Market"},
  ["grand bazaar","spice bazaar","chatuchak","boqueria","borough market","tsukiji outer market","dry bridge"]),
 ("Views &amp; <em>nature</em>", "Parks, viewpoints, gardens and water",
  {"Viewpoint","Park","Waterfall","Beach","Garden","Bridge"},
  ["central park","gardens by the bay","galata","tower bridge","charles bridge","golden gate",
   "retiro","mtatsminda","victoria peak"]),
]
AVOID = ["knossos", "bosphorus strait"]   # source photo is a map
def norm(s):
    s = unicodedata.normalize("NFKD", s.lower())
    return "".join(ch for ch in s if not unicodedata.combining(ch))
used, used_img = set(), set()
def best_match(term):
    """Closest page for a famous name: the term must cover at least half of the
    page title, and the shortest such title wins - so "louvre" lands on Louvre,
    not Louvre Abu Dhabi, and "tsukiji outer market" never lands on a temple."""
    c = [a for a in attr if term in norm(a["name"]) and len(term) / len(norm(a["name"])) >= 0.5]
    return min(c, key=lambda a: len(a["name"])) if c else None

# pass 1: claim the famous places for their own rail before anyone fills by type
FAM = {}
for t in THEMES:
    lst = []
    for f in t[3]:
        a = best_match(f)
        if a and a["url"] not in {x["url"] for v in FAM.values() for x in v} and a not in lst:
            lst.append(a)
    FAM[t[0]] = lst
CLAIMED = {a["url"] for v in FAM.values() for a in v}

def pick(types, famous_list, n=12, per_city=2):
    rest = sorted([a for a in attr if a["type"] in types and a["url"] not in CLAIMED],
                  key=lambda a: (-(a["min"] + min(ccount.get(a["city"], 0), 30) / 3), a["name"]))
    pool = [a for a in famous_list + rest if not any(b in norm(a["name"]) for b in AVOID)]
    out, per, seen = [], collections.Counter(), set()
    cities_n = {norm(v) for v in cname.values()}
    for a in pool:
        key = (a["city"], norm(a["name"]).replace("q", "k")[:7])
        if key in seen or norm(a["name"]) in cities_n: continue
        if a["url"] in used or a["img"] in used_img or per[a["city"]] >= per_city: continue
        seen.add(key)
        out.append(a); used.add(a["url"]); used_img.add(a["img"]); per[a["city"]] += 1
        if len(out) == n: break
    return out

def meta(a):
    return esc(cname[a["city"]]) + (f' &middot; {esc(a["type"])}' if a["type"] and len(a["type"]) <= 12 else "")

rails = []
for title, sub, types, famous in THEMES:
    items = pick(types, FAM[title])
    if len(items) < 6: continue
    cards = "".join(pcard(a["url"], a["img"], a["name"], meta(a)) for a in items)
    rails.append(f'<section><div class="shead"><div><span class="eyebrow">{len(items)} free guides</span>'
                 f'<h2>{title}</h2><p>{sub}</p></div></div><div class="rail">{cards}</div></section>')

# ---------- cities rail ----------
top = [c for c in sorted(cities, key=lambda c: -c["n"]) if c["n"] >= 8][:16]
city_cards = "".join(
    pcard(f'{SITE}/explore/en/{c["slug"]}.html', city_photo(c["slug"]), c["name"],
          f'{c["n"]} free guides', cls="pcard wide") for c in top if city_photo(c["slug"]))

# ---------- a-z ----------
def initial(n):
    n = "".join(ch for ch in unicodedata.normalize("NFKD", n) if not unicodedata.combining(ch))
    return n[0].upper() if n[0].isascii() and n[0].isalpha() else "#"
az = "".join(f'<a href="{SITE}/explore/en/{esc(c["slug"])}.html">{esc(c["name"])}<span>{c["n"]}</span></a>'
             for c in sorted(cities, key=lambda c: (initial(c["name"]), c["name"])))

# ---------- search index (lazy-loaded json) ----------
idx = [{"t": c["name"], "s": f'{c["n"]} free guides', "u": f'{SITE}/explore/en/{c["slug"]}.html',
        "i": card_img(city_photo(c["slug"])) or "", "k": "City"} for c in cities]
idx += [{"t": a["name"], "s": f'{cname[a["city"]]} · {a["type"] or "Place"}', "u": a["url"],
         "i": card_img(a["img"]), "k": "Place"} for a in attr]
json.dump(idx, open(os.path.join(os.path.dirname(OUT), "search-index.json"), "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))

total = len(attr)
HI, LZ = 'fetchpriority="high"', 'loading="lazy"'
slides_html = "".join(
    f'<img src="{SITE}/images/cities/{s}.jpg" alt="{esc(cname[s])}" data-i="{i}" '
    f'style="opacity:{1 if i==0 else 0};transition:opacity 1.2s ease" '
    f'{HI if i==0 else LZ} decoding="async">'
    for i, (s, _) in enumerate(SLIDES))
slides_json = json.dumps([{"n": cname[s], "t": t, "u": f"{SITE}/explore/en/{s}.html", "c": ccount[s]}
                          for s, t in SLIDES], ensure_ascii=False)
s0, t0 = SLIDES[0]

TITLE = ("[PREVIEW] " if PREVIEW else "") + f"Explore {len(cities)} Cities — Free Audio Guides | Lokali"
DESC = (f"Free audio guides for {total:,} landmarks in {len(cities)} cities. Ancient wonders, great museums, "
        "sacred places and old towns, in 50+ languages. Offline, no ticket.")[:158]
ROBOTS = "noindex,nofollow" if PREVIEW else "index,follow,max-image-preview:large,max-snippet:-1"

doc = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#110c08">
<script>if(window.Capacitor){{location.replace("{SITE}/");}}</script>
<title>{esc(TITLE)}</title>
<meta name="description" content="{esc(DESC)}">
<meta name="robots" content="{ROBOTS}">
<link rel="canonical" href="{SITE}/explore/index.html">
<meta property="og:type" content="website"><meta property="og:site_name" content="Lokali">
<meta property="og:title" content="{esc(TITLE)}"><meta property="og:description" content="{esc(DESC)}">
<meta property="og:url" content="{SITE}/explore/index.html">
<meta property="og:image" content="{SITE}/images/cities/{s0}.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="preload" as="image" href="{SITE}/images/cities/{s0}.jpg">
{FONTS}
<style>{CSS}</style>
<script type="application/ld+json">{{"@context":"https://schema.org","@graph":[
{{"@type":"CollectionPage","name":"Explore cities with Lokali","url":"{SITE}/explore/index.html","description":{json.dumps(DESC)},"inLanguage":"en","isPartOf":{{"@type":"WebSite","name":"Lokali","url":"{SITE}/"}}}},
{{"@type":"BreadcrumbList","itemListElement":[{{"@type":"ListItem","position":1,"name":"Lokali","item":"{SITE}/"}},{{"@type":"ListItem","position":2,"name":"Explore","item":"{SITE}/explore/index.html"}}]}}]}}</script>
</head>
<body>
{topbar()}
<main class="wrap">
<nav class="crumbs"><a href="{SITE}/">Lokali</a><span class="sep">&rsaquo;</span><span>Explore</span></nav>

<section class="hero" id="hero" style="padding-bottom:40px">
{slides_html}<span class="ov"></span>
<div class="hero-copy">
<span class="badge">{len(cities)} cities &middot; {total:,} free guides</span>
<h1>Lokali <em id="h-name">{esc(cname[s0])}</em></h1>
<p class="tag" id="h-tag">{esc(t0)}</p>
<div class="btns"><a class="btn gold" id="h-go" href="{SITE}/explore/en/{s0}.html">Explore <span id="h-name2">{esc(cname[s0])}</span> &rarr;</a>
<a class="btn ghost" href="{PLAY.format(c="hero")}" rel="nofollow" target="_blank"><span class="pl">&#9654;</span>Listen in the app</a></div>
</div>
</section>

<div class="search" role="search">
<div class="sbox">
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
<input id="q" type="search" placeholder="Search {len(cities)} cities and {total:,} landmarks&hellip;" autocomplete="off" aria-label="Search cities and landmarks">
<button class="go" id="qgo" type="button">GO &rarr;</button>
</div>
<div class="results" id="res" role="listbox"></div>
</div>

{''.join(rails[:2])}

<section><div class="shead"><div><span class="eyebrow">Start here</span><h2>Cities to <em>start with</em></h2><p>The most complete guides on Lokali</p></div></div>
<div class="rail" style="grid-auto-columns:minmax(300px,340px)">{city_cards}</div></section>

{''.join(rails[2:])}

<details class="az"><summary>All {len(cities)} cities, A&ndash;Z</summary><div class="azin">{az}</div></details>

{apppanel(f"{SITE}/images/cities/rome.jpg", "explore-index")}
{FOOTER}
</main>
<script>
(function(){{
 var S={slides_json},imgs=[].slice.call(document.querySelectorAll('#hero>img')),i=0,
     nm=document.getElementById('h-name'),nm2=document.getElementById('h-name2'),
     tg=document.getElementById('h-tag'),go=document.getElementById('h-go');
 if(imgs.length>1&&!matchMedia('(prefers-reduced-motion: reduce)').matches)setInterval(function(){{
   imgs[i].style.opacity=0;i=(i+1)%imgs.length;imgs[i].style.opacity=1;
   nm.textContent=S[i].n;nm2.textContent=S[i].n;tg.textContent=S[i].t;go.href=S[i].u;}},6500);

 var q=document.getElementById('q'),res=document.getElementById('res'),data=null,hl=-1;
 function norm(s){{return s.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase()}}
 function load(){{if(data)return Promise.resolve(data);
   return fetch('search-index.json').then(function(r){{return r.json()}}).then(function(d){{
     d.forEach(function(x){{x.n=norm(x.t)}});data=d;return d}})}}
 function render(){{
   var v=norm(q.value.trim());if(!v){{res.classList.remove('on');res.innerHTML='';return}}
   load().then(function(d){{
     var hits=d.filter(function(x){{return x.n.indexOf(v)>-1||norm(x.s).indexOf(v)>-1}});
     hits.sort(function(a,b){{var sa=a.n.indexOf(v)===0?0:1,sb=b.n.indexOf(v)===0?0:1;
       if(sa!==sb)return sa-sb;if(a.k!==b.k)return a.k==='City'?-1:1;return a.t.localeCompare(b.t)}});
     hits=hits.slice(0,12);hl=-1;
     res.innerHTML=hits.length?hits.map(function(x){{return '<a href="'+x.u+'"><img src="'+x.i+'" alt="" loading="lazy"><span><span class="t">'+x.t.replace(/</g,'&lt;')+'</span><br><span class="s">'+x.s.replace(/</g,'&lt;')+'</span></span><span class="k">'+x.k+'</span></a>'}}).join('')
       :'<div class="none">Nothing matches that yet. Try a city name.</div>';
     res.classList.add('on');}});
 }}
 q.addEventListener('focus',load);q.addEventListener('input',render);
 q.addEventListener('keydown',function(e){{var a=res.querySelectorAll('a');if(!a.length)return;
   if(e.key==='ArrowDown'||e.key==='ArrowUp'){{e.preventDefault();if(hl>-1)a[hl].classList.remove('hl');
     hl=(hl+(e.key==='ArrowDown'?1:-1)+a.length)%a.length;a[hl].classList.add('hl');a[hl].scrollIntoView({{block:'nearest'}})}}
   else if(e.key==='Enter'){{location.href=a[Math.max(hl,0)].href}}}});
 document.getElementById('qgo').addEventListener('click',function(){{var a=res.querySelector('a');if(a)location.href=a.href;else q.focus()}});
 document.addEventListener('click',function(e){{if(!e.target.closest('.search'))res.classList.remove('on')}});
}})();
</script>
</body>
</html>
'''
open(OUT, "w", encoding="utf-8").write(doc)
print("index", len(doc), "bytes | rails", len(rails), "| city cards", city_cards.count("pcard"),
      "| search entries", len(idx))
