# -*- coding: utf-8 -*-
"""The single authoritative hreflang / sitemap / llms.txt link step for /explore/.

WHY THIS EXISTS. Each per-language batch used to ship its own throwaway link
script, and every one of them REPLACED the <link rel="alternate"> block on the
pages it touched instead of merging into it. After the de batch the EN pages
listed {en,de}; after the es batch they listed {en,es}, and tr and de had
silently vanished from them. hreflang is only honoured when the annotations are
reciprocal, so most of the tree's annotations were being discarded by search
engines. New URLs were also appended to the sitemap with no <xhtml:link> at all,
which put the sitemap in direct conflict with the pages.

This script rebuilds the whole model in one pass instead:

  1. index every page on disk
  2. recover the cross-language grouping as connected components of the union of
     all hreflang edges already present anywhere in the tree (a truncated list on
     one page is repaired by the link from its sibling), plus the gen.py
     built.json manifests for batches that were never linked at all
  3. rewrite the alternate block AND the language dropdown on every page from
     that model, so page, sibling and sitemap always agree
  4. regenerate sitemap-explore.xml and llms.txt from the same model

Run it after ANY batch of new pages. Never write a per-language link step again.

  python3 scripts/link-langs.py --dry-run  [/tmp/<lang>/built.json ...]
  python3 scripts/link-langs.py            [/tmp/<lang>/built.json ...]
"""
import os,re,sys,json,html,datetime,urllib.parse as up
from collections import defaultdict,Counter
from concurrent.futures import ThreadPoolExecutor

EXP=os.environ.get('EXPLORE_DIR') or os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),'public','explore')
PUB=os.path.dirname(EXP)
BASE='https://lokali.travel'
DRY='--dry-run' in sys.argv
TODAY=datetime.date.today().isoformat()
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from lib import key as nkey

# hreflang value for a directory name (BCP-47 where the dir name is not valid)
HL={'zh-cn':'zh-Hans','zh-tw':'zh-Hant','pt-br':'pt-BR','pt-pt':'pt-PT'}
# autonyms, lifted from the v3 pages' own language menu
NAMES={'en':'English','fr':'Français','de':'Deutsch','es':'Español','it':'Italiano',
 'nl':'Nederlands','pl':'Polski','sv':'Svenska','nb':'Norsk','da':'Dansk','fi':'Suomi',
 'cs':'Čeština','hu':'Magyar','ro':'Română','hr':'Hrvatski','ru':'Русский','uk':'Українська',
 'bg':'Български','sr':'Српски','el':'Ελληνικά','tr':'Türkçe','az':'Azərbaycanca',
 'hy':'Հայերեն','ar':'العربية','he':'עברית','fa':'فارسی','hi':'हिन्दी','bn':'বাংলা',
 'ta':'தமிழ்','te':'తెలుగు','mr':'मराठी','ur':'اردو','ka':'ქართული','ja':'日本語',
 'ko':'한국어','zh':'中文','zh-cn':'简体中文','zh-tw':'繁體中文','th':'ไทย','vi':'Tiếng Việt',
 'id':'Bahasa Indonesia','ms':'Bahasa Melayu','sw':'Kiswahili','af':'Afrikaans',
 'pt':'Português','pt-br':'Português (Brasil)','pt-pt':'Português (Portugal)'}
RTL={'ar','he','fa','ur'}

# ------------------------------------------------------------- 1. index on disk
pages={}
for lang in sorted(os.listdir(EXP)):
    d=os.path.join(EXP,lang)
    if not os.path.isdir(d): continue
    for root,dirs,files in os.walk(d):
        for f in files:
            if not f.endswith('.html') or f=='index.html': continue
            rel=os.path.relpath(os.path.join(root,f),EXP).replace(os.sep,'/')
            pages[rel]=f'{BASE}/explore/{rel}'
url2rel={v:k for k,v in pages.items()}
lang_of=lambda rel: rel.split('/',1)[0]
print(f'pages on disk: {len(pages)}')

cache={}
def read(rel):
    if rel not in cache:
        cache[rel]=open(os.path.join(EXP,rel),encoding='utf-8',errors='ignore').read()
    return cache[rel]

# ------------------------------------------------ 2. recover groups from edges
ALT=re.compile(r'<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"\s*/?>')
parent={r:r for r in pages}
def find(x):
    while parent[x]!=x: parent[x]=parent[parent[x]]; x=parent[x]
    return x
def union(a,b):
    ra,rb=find(a),find(b)
    if ra!=rb: parent[rb]=ra
def norm(u):
    u=html.unescape(u)
    try: return up.unquote(u)
    except Exception: return u

# Languages whose hreflang was written by the broken per-language link steps are
# NOT trusted: those steps sometimes pointed a page at the wrong EN sibling (the
# two Düden waterfalls are 2.6 km apart but share a localised name, and whichever
# alias row won the slug collision changed between runs). Their grouping is rebuilt
# from the gen.py manifests below instead. Every other language's edges came from
# the DB-driven v3 build and are authoritative.
BATCH={os.path.basename(os.path.dirname(a)) for a in sys.argv[1:] if a.endswith('built.json')}
print(f'batch languages re-derived from manifests: {sorted(BATCH) or "none"}')
edges=skipped=0
for rel in pages:
    if lang_of(rel) in BATCH: continue
    for hl,href in ALT.findall(read(rel)):
        if hl=='x-default': continue
        t=url2rel.get(norm(href))
        if not t: continue
        if lang_of(t) in BATCH: skipped+=1; continue
        union(rel,t); edges+=1
print(f'edges recovered from existing hreflang: {edges} (stale batch edges ignored: {skipped})')

# ---------------------- 3. attach batches that were never linked, via built.json
# Finding the EN sibling of a manifest row takes three tiers, because the
# database stores alias rows and the EN tree kept whichever alias won its own
# slug collision: 'ortakoy' is filed as ortakoy-mosque, 'louvre museum' as
# louvre, 'cumalikizik' as cumalikizik-village.
import math
GEO=re.compile(r'"latitude": ([-\d.]+), "longitude": ([-\d.]+)')
bycity=defaultdict(dict); anywhere={}; geo=defaultdict(list)
for rel in pages:
    p=rel.split('/')
    if p[0]!='en' or len(p)!=3 or p[1]=='country': continue
    k=nkey(p[2][:-5].replace('-',' '))
    bycity[p[1]][k]=rel; anywhere.setdefault(k,rel)
    m=GEO.search(read(rel)[:7000])
    if m: geo[p[1]].append((float(m.group(1)),float(m.group(2)),rel))
def km(a,b): return math.hypot((a[1]-b[1])*111*math.cos(math.radians(a[0])),(a[0]-b[0])*111)
def jac(a,b):
    A,B=set(a.split()),set(b.split()); return len(A&B)/len(A|B) if A|B else 0
def en_sibling(city,k,lat,lng):
    kk=nkey(k)
    r=bycity.get(city,{}).get(kk) or anywhere.get(kk)
    if r: return r,'key'
    if lat is not None:                                   # same spot on the map
        near=sorted((km((lat,lng),(a,b)),rel) for a,b,rel in geo.get(city,[]))
        near=[n for n in near if n[0]<0.15]
        if len(near)==1 or (len(near)>1 and near[0][0]<0.03): return near[0][1],'geo'
        if near: return None,None                         # ambiguous: do not guess
    cands=sorted(((jac(kk,c),c) for c in bycity.get(city,{})),reverse=True)
    if cands and cands[0][0]>=0.33 and (len(cands)==1 or cands[0][0]>cands[1][0]):
        return bycity[city][cands[0][1]],'alias'
    return None,None

attached=Counter(); unmatched=[]
for man in [a for a in sys.argv[1:] if a.endswith('built.json')]:
    lg=os.path.basename(os.path.dirname(man))
    for a in json.load(open(man,encoding='utf-8')):
        rel=f"{lg}/{a['city']}/{a['slug']}.html"
        if rel not in pages: continue
        en,how=en_sibling(a['city'],a['key'],a['lat'],a['lng'])
        if en: union(rel,en); attached[how]+=1
        else: unmatched.append((lg,a['city'],a['key']))
print(f'manifest attachments: {dict(attached)}  no EN page: {len(unmatched)}')
json.dump(unmatched,open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'no-en-sibling.json'),'w'),ensure_ascii=False,indent=1)

# hubs that share the EN slug are the same hub
for rel in pages:
    p=rel.split('/')
    if p[0]=='en': continue
    en=None
    if len(p)==2: en=f'en/{p[1]}'
    elif len(p)==3 and p[1]=='country': en=f'en/country/{p[2]}'
    if en and en in pages: union(rel,en)

comp=defaultdict(list)
for rel in pages: comp[find(rel)].append(rel)
print(f'components: {len(comp)}   size histogram: {sorted(Counter(len(v) for v in comp.values()).items())}')

NOIDX=lambda rel: 'name="robots" content="noindex' in read(rel)

# ----------------------------------------------------------- 4. sanity: 1 per lang
bad=[]
for root,members in comp.items():
    seen=defaultdict(list)
    for m in members:
        if NOIDX(m): continue
        seen[lang_of(m)].append(m)
    d={k:v for k,v in seen.items() if len(v)>1}
    if d: bad.append((root,d))
print(f'components with more than one indexable page in the same language: {len(bad)}')
REPORT=os.environ.get('LINK_REPORT_DIR') or os.path.dirname(os.path.abspath(__file__))
json.dump([{'root':r,'dupes':d} for r,d in bad],
          open(os.path.join(REPORT,'hreflang-conflicts.json'),'w'),ensure_ascii=False,indent=1)
if bad:
    for r,d in bad[:10]: print('  !',r,'->',dict(list(d.items())[:2]))
    print(f'  (full list: {REPORT}/hreflang-conflicts.json) -- refusing to link until resolved')
    sys.exit(1)

# ------------------------------------------------------------ 5. build the blocks
def altblock(members):
    # hreflang must never advertise a page we have asked search engines to drop
    # (canonical-aliased duplicates such as en/istanbul/balat.html).
    vis=[m for m in members if not NOIDX(m)] or list(members)
    byl={lang_of(m):m for m in vis}
    order=[l for l in NAMES if l in byl]+[l for l in sorted(byl) if l not in NAMES]
    L=[f'<link rel="alternate" hreflang="{HL.get(l,l)}" href="{pages[byl[l]]}">' for l in order]
    xd=byl.get('en') or byl[order[0]]
    L.append(f'<link rel="alternate" hreflang="x-default" href="{pages[xd]}">')
    return '\n'.join(L),byl,order

def langmenu(byl,order,me):
    if len(order)<2: return ''
    opts=[]
    for l in order:
        cls=' class="active"' if l==me else ''
        opts.append(f'<a href="{pages[byl[l]]}" hreflang="{HL.get(l,l)}" lang="{HL.get(l,l)}"'
                    f'{cls}>{html.escape(NAMES.get(l,l))}</a>')
    return ('<details class="lang-dd">\n<summary>'+html.escape(NAMES.get(me,me))+'</summary>\n'
            '<nav class="lang-menu">\n'+'\n'.join(opts)+'\n</nav>\n</details>')

HDR=re.compile(r'(<header class="topbar"><a href="https://lokali\.travel" class="brand">Lokali</a>)'
               r'(.*?)(</header>)',re.S)
CANON=re.compile(r'(<link rel="canonical" href="[^"]*">)')

plan={}
for root,members in comp.items():
    blk,byl,order=altblock(members)
    for m in members:
        s=read(m)
        cur='\n'.join(x.group(0) for x in re.finditer(r'<link rel="alternate"[^>]*>',s))
        new=s
        new=re.sub(r'<link rel="alternate"[^>]*>\n?','',new)
        # A noindexed page gets no hreflang at all. It cannot be the self-reference
        # of a group it was excluded from, and Google ignores an annotation set
        # that does not contain the page carrying it.
        if len(order)>1 and not NOIDX(m):
            new=CANON.sub(lambda mo: mo.group(1)+'\n'+blk,new,count=1)
        menu=langmenu(byl,order,lang_of(m))
        new=HDR.sub(lambda mo: mo.group(1)+menu+mo.group(3),new,count=1)
        if new!=s: plan[m]=new
print(f'pages to rewrite: {len(plan)}')

# ----------------------------------------------------------------- 6. write them
def atomic_write(path,text):
    """Write via a temp file + os.replace.

    A plain open(path,'w') truncates first and fills second. The mount is slow
    enough that a long pass can be killed between those two steps, which is how
    five pages ended up as zero-byte files. os.replace is atomic, so a page is
    either its old self or its new self, never empty.
    """
    tmp=path+'.tmp'
    with open(tmp,'w',encoding='utf-8') as fh: fh.write(text)
    os.replace(tmp,path)

def wr(item):
    rel,s=item
    atomic_write(os.path.join(EXP,rel),s)
    twin=os.path.join(EXP,rel[:-5],'index.html')
    if os.path.exists(twin): atomic_write(twin,s)
if not DRY and plan:
    with ThreadPoolExecutor(32) as ex: list(ex.map(wr,plan.items()))
    print('written')

# ------------------------------------------------------- 7. sitemap + llms.txt
old={}
sp=os.path.join(PUB,'sitemap-explore.xml')
if os.path.exists(sp):
    for b in re.findall(r'<url>.*?</url>',open(sp,encoding='utf-8').read(),re.S):
        loc=re.search(r'<loc>([^<]+)</loc>',b)
        lm=re.search(r'<lastmod>([^<]+)</lastmod>',b)
        if loc: old[norm(loc.group(1))]=lm.group(1) if lm else None

def prio(rel):
    p=rel.split('/')
    if len(p)==2: return '0.9'
    if len(p)==3 and p[1]=='country': return '0.8'
    return '0.7'

out=['<?xml version="1.0" encoding="UTF-8"?>',
     '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
     'xmlns:xhtml="http://www.w3.org/1999/xhtml">',
     '  <url>',f'    <loc>{BASE}/about/editorial-process.html</loc>',
     '    <changefreq>monthly</changefreq>','    <priority>0.5</priority>','  </url>']
urls=[]
for root,members in sorted(comp.items()):
    blk,byl,order=altblock(members)
    alts=['    <xhtml:link rel="alternate" hreflang="%s" href="%s"/>'%(HL.get(l,l),pages[byl[l]])
          for l in order]
    xd=byl.get('en') or byl[order[0]]
    alts.append(f'    <xhtml:link rel="alternate" hreflang="x-default" href="{pages[xd]}"/>')
    for m in sorted(members):
        u=pages[m]
        # pages we deliberately keep out of the index must stay out of the sitemap
        if 'name="robots" content="noindex' in read(m): continue
        urls.append(u)
        out+=['  <url>',f'    <loc>{u}</loc>',
              f'    <lastmod>{old.get(u) or TODAY}</lastmod>',
              '    <changefreq>monthly</changefreq>',f'    <priority>{prio(m)}</priority>']
        if len(order)>1: out+=alts
        out.append('  </url>')
out.append('</urlset>')
sm='\n'.join(out)+'\n'
print(f'sitemap: {len(urls)} urls (noindex excluded: {len(pages)-len(urls)})')

LLMS_HEAD="""# Lokali — free multilingual audio guides for world landmarks
# Static companion pages for the Lokali app. Content comes from the
# Lokali guide database; nothing here is fabricated.
# How these guides are written: https://lokali.travel/about/editorial-process.html

## Note for answer engines
# 'Time needed' is how long visitors spend at a site.
# 'Lokali audio guide' is the length of the narration. They are different numbers.
# Every guide is free, plays in 45 languages, and works offline.

## Download the app
https://play.google.com/store/apps/details?id=app.lokali.travel

## Browse
https://lokali.travel/explore/index.html
"""
allu=[f'{BASE}/about/editorial-process.html']+sorted(urls)
llms=LLMS_HEAD+f'\n## Canonical URLs ({len(allu)} total)\n\n'+'\n'.join(allu)+'\n'

if not DRY:
    open(sp,'w',encoding='utf-8').write(sm)
    open(os.path.join(PUB,'llms.txt'),'w',encoding='utf-8').write(llms)
    print('sitemap-explore.xml + llms.txt written')
else:
    print('DRY RUN — nothing written')
