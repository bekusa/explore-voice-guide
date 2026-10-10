# -*- coding: utf-8 -*-
"""Build /explore/<lang>/ attraction pages + city hubs from cached_guides.

Content comes entirely from the database (script, key_facts, look_for, tips,
title). Only the template chrome -- section headings, table labels, FAQ wording
and the sentence frame around DB facts -- is per-language, and lives in a small
strings module (esstr.py, destr.py, ...). Nothing is machine-translated.
"""
import json,os,re,sys,math,html,glob,importlib
import statistics as st
from collections import defaultdict
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from lib import key,slug

LANG=sys.argv[1]; D=importlib.import_module(sys.argv[2])
# WD is the DATA directory: the guide export (g_*.json), facts.json, photos.json,
# todo.json and the page assets lifted from an existing EN page. It is not the
# repo -- those files are build inputs, not source. Set GEN_DATA_DIR to point at
# it; EXPLORE_DIR points at public/explore in the checkout.
WD=os.environ.get('GEN_DATA_DIR') or os.path.dirname(os.path.abspath(__file__))
EXP=os.environ.get('EXPLORE_DIR') or os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),'public','explore')
OUT=os.path.join(EXP,LANG); EN=os.path.join(EXP,'en')
BASE='https://lokali.travel'; EDIT=BASE+'/about/editorial-process.html'
PLAY=(f'https://play.google.com/store/apps/details?id=app.lokali.travel'
      f'&utm_source=seo&utm_medium=explore&utm_campaign={LANG}&utm_content=')
CSS=open(f'{WD}/style.css',encoding='utf-8').read()
IC={c:open(f'{WD}/ic_{c}.svg',encoding='utf-8').read() for c in ('facts','look','tips')}
ICM=open(f'{WD}/ic_map.svg',encoding='utf-8').read()
PBAR=(open(f'{WD}/playbar.html',encoding='utf-8').read()
      .replace('utm_campaign=en',f'utm_campaign={LANG}')
      .replace('>Get the app<','>'+D.UI['getapp']+'<'))
# Non-Latin languages must transliterate before slugging, otherwise slug()
# strips every character and every page in a city collides on one empty name.
# A strings module supplies translit(); Latin-script languages need none.
SLUG=lambda s: slug(getattr(D,'translit',lambda x:x)(s))
# Scripts differ in how much fits a SERP: 158 Latin characters and 158 Chinese
# characters are not the same width, so a strings module may narrow the budget.
MAXDESC=getattr(D,'MAXDESC',158); MAXTITLE=getattr(D,'MAXTITLE',62)
_ABBR=re.compile(r'(?:^|\s)(?:\w{1,2}|Dr|Mrs|Jr|bzw|ca|etc|vgl)\.$',re.UNICODE)
def shrink(d,limit):
    """Trim to whole sentences, keeping the Lokali line if it still fits.

    The free-guide sentence is last and is exactly what a SERP cuts off, so it
    gets first claim on the budget -- but only when real sentences fit in front
    of it, otherwise the page would say nothing about the place itself."""
    if len(d)<=limit: return d
    # The "are there sentences here at all?" guard has to know CJK punctuation,
    # or every Chinese description falls straight through to a blunt cut.
    if not re.search(r'[.!?\u3002\uff01\uff1f]',d): return d[:limit-1].rstrip()+'\u2026'
    parts=re.split(r'(?<=[.!?\u3002\uff01\uff1f])\s*',d.strip()); S=[]
    for x in parts:
        if not x: continue
        if S and _ABBR.search(S[-1]): S[-1]+=' '+x
        else: S.append(x)
    def fill(seq,lim):
        k=''
        for x in seq:
            c=(k+(' ' if k and k[-1] not in '\u3002\uff01\uff1f' else '')+x).strip()
            if len(c)<=lim: k=c
            else: break
        return k
    hook=S[-1] if len(S)>1 and 'Lokali' in S[-1] else None
    if hook:
        k=fill(S[:-1],limit-len(hook)-1)
        if k: return k+('' if k[-1] in '\u3002\uff01\uff1f' else ' ')+hook
    k=fill(S,limit)
    return k or re.sub(r'[\s\u2014\u2013,;:-]+$','',d[:limit-1].rsplit(' ',1)[0])+'\u2026'
# "<label> <City>" is a Latin word order with a Latin space in it. Georgian wants
# the city first and Chinese wants no space at all, so both headings are hooks.
MORE=lambda city: getattr(D,'more_heading',lambda c: f'{D.SEC["more"]} {c}')(city)
GUIDES_IN=lambda k: getattr(D,'guides_in',lambda x: f'{D.UI["guidesin"]} {x}')(k)
NL='\n'; esc=lambda s: html.escape(s or '',quote=True); txt=lambda s: html.escape(s or '',quote=False)
mins=lambda s: max(1,round((s or 0)/60))
def dist(a,b): return math.hypot((a[1]-b[1])*111*math.cos(math.radians(a[0])),(a[0]-b[0])*111)

facts=json.load(open(f'{WD}/facts.json')); todo=set(json.load(open(f'{WD}/todo.json')))
rows=[]
for f in glob.glob(f'{WD}/g_*.json'):
    d=json.load(open(f))
    if isinstance(d,list): rows+=d
gmap=defaultdict(list)
for r in rows: gmap[key(r['name_normalized'])].append(r)
photos=defaultdict(list)
for p in json.load(open(f'{WD}/photos.json')):
    q=p['cache_key'].split('|'); photos[key(q[-1])].append((key(' '.join(q[1:-1])),p['url']))

# Languages written in a non-Latin script cannot make a readable slug out of
# their own title, and their existing pages already sit on the English slug
# (explore/zh-cn/istanbul/hagia-sophia.html). A strings module sets USE_EN_SLUG
# so new pages land in the same place instead of inventing a romanisation.
USE_EN_SLUG=getattr(D,'USE_EN_SLUG',False)
enslug={}
meta={}; pts=defaultdict(list)
for city in os.listdir(EN):
    d=os.path.join(EN,city)
    if not os.path.isdir(d) or city=='country': continue
    first=True
    for f in sorted(os.listdir(d)):
        if not f.endswith('.html') or f=='index.html': continue
        if first:
            t=open(os.path.join(d,f),encoding='utf-8',errors='ignore').read()
            cd=re.search(r'country/([^"]+)\.html">([^<]+)</a>',t); cc=re.search(r'"addressCountry":\s*"([A-Z]{2})"',t)
            cl=re.search(r'"addressLocality":\s*"([^"]+)"',t)
            if cd and cc: meta[city]=[cd.group(1),cd.group(2),cc.group(1),cl.group(1) if cl else city.title()]
            first=False
        enslug.setdefault(key(f[:-5].replace('-',' ')),(city,f[:-5]))
        fx=facts.get(key(f[:-5].replace('-',' ')))
        if fx and fx.get('lat'): pts[city].append((float(fx['lat']),float(fx['lng'])))
cent={c:(st.median([p[0] for p in v]),st.median([p[1] for p in v])) for c,v in pts.items() if c in meta and v}
HAVE_C={f[:-5] for f in os.listdir(os.path.join(EN,'country')) if f.endswith('.html')}
CN=getattr(D,'COUNTRY',{})

def photo(k,city):
    ck=key(city)
    if k in photos:
        for cc,u in photos[k]:
            if ck and (ck in cc or cc in ck): return u
        return photos[k][0][1]

def build():
    out=[]
    for k in sorted(todo):
        rs=gmap.get(k) or []
        if not rs: continue
        best=max(rs,key=lambda r:len(json.dumps(r['payload'],ensure_ascii=False)))
        p=best['payload']
        if not (p.get('script') and p.get('title')): continue
        if not getattr(D,'USE_EN_SLUG',False) and not SLUG(p['title']):
            print('  SKIP empty slug:',p['title']); continue
        fx=facts.get(k) or {}
        la=lo=None
        if fx.get('lat') and fx.get('lng'): la,lo=round(float(fx['lat']),4),round(float(fx['lng']),4)
        city=None
        if la is not None and cent:
            d,c=sorted(((dist((la,lo),v),c) for c,v in cent.items()))[0]
            if d<=60: city=c
        if not city:
            db=[r['city_normalized'] for r in rs if r['city_normalized'] and r['city_normalized']!='istanbul'] \
               or [r['city_normalized'] for r in rs if r['city_normalized']]
            city=slug(db[0]) if db else None
        if not city or city not in meta: continue
        m=meta[city]
        sg=SLUG(p['title'])
        if USE_EN_SLUG:
            en=enslug.get(k)
            if not en: continue                      # no English page -> no slug to borrow
            city,sg=en[0],en[1]
            if city not in meta: continue
            m=meta[city]                             # the English page decides the city too
        out.append({'key':k,'title':p['title'].strip(),'slug':sg,'city':city,
          'city_disp':m[3],'country':CN.get(m[0],m[1]),'country_slug':m[0],'cc':m[2],
          'lat':la,'lng':lo,'type':fx.get('type'),'category':fx.get('category'),
          'visit':D.dur(fx.get('duration')),'dur_sec':p.get('estimated_duration_seconds'),
          'script':p.get('script'),'key_facts':p.get('key_facts') or [],
          'look_for':p.get('look_for') or [],'tips':p.get('tips') or [],'image':photo(k,m[3])})
    # The database holds alias rows ('duden waterfall' / 'duden waterfalls',
    # 'ortakoy' / 'ortakoy mosque'), and some distinct places share one localised
    # title in a given language. Either way they slug to the same filename, so the
    # second write used to silently overwrite the first while the city hub still
    # listed both. Keep the richest payload per slug and report the rest.
    seen={}; dropped=[]
    for a in out:
        sk=(a['city'],a['slug'])
        if sk in seen:
            keep=max(seen[sk],a,key=lambda x:len(x['script'] or ''))
            dropped.append((sk,(seen[sk] if keep is a else a)['key']))
            seen[sk]=keep
        else: seen[sk]=a
    if dropped:
        print(f'  slug collisions dropped: {len(dropped)}')
        json.dump(dropped,open(f'{WD}/collisions.json','w'),ensure_ascii=False,indent=1)
    return list(seen.values())

def answer(a):
    # "City, Country" is a Latin convention; Chinese wants "City（Country）".
    where=getattr(D,'where',lambda c,k: f'{c}, {k}')(a['city_disp'],a['country'])
    SEP=getattr(D,'SEP',' '); STOP=getattr(D,'STOP','.')
    t=a['title']; tp=D.type_phrase(a['type'])
    # Korean particles (은/는, 이/가) depend on the last syllable of the name, so
    # the strings module can ask for them by including {eun} in its sentence.
    kw=dict(t=t,tp=tp,where=where)
    for k in ('eun','iga','eul'):
        f=getattr(D,{'eun':'EUN','iga':'I_GA','eul':'EUL'}[k],None)
        if f: kw[k]=f(t)
    P=[D.SENT['is'].format(**kw) if tp else D.SENT['in'].format(**kw)]
    kf=(a['key_facts'] or [None])[0]
    s=(kf or re.split(r'(?<=[.!?\u3002])\s*',a['script'] or '')[0]).strip().rstrip('.\u3002!?\uff01\uff1f ')
    if s: P.append(s+STOP)
    if len(' '.join(P).split())<40 and len(a['key_facts'])>1:
        P.append(a['key_facts'][1].strip().rstrip('.\u3002!?\uff01\uff1f ')+STOP)
    if a['visit']: P.append(D.SENT['spend'].format(vis=a['visit']))
    P.append(D.SENT['runs'].format(n=mins(a['dur_sec'])))
    return SEP.join(P)

def head(title,desc,url,img,g,noindex=False):
    L=['<!DOCTYPE html>',f'<html lang="{LANG}" dir="{getattr(D,"DIR","ltr")}">','<head>','<meta charset="utf-8">',
     '<meta name="viewport" content="width=device-width, initial-scale=1">',
     '<meta name="theme-color" content="#110c08">',f'<title>{esc(title)}</title>',
     f'<meta name="description" content="{esc(desc)}">',f'<link rel="canonical" href="{url}">']
    if noindex: L.append('<meta name="robots" content="noindex, follow">')
    L+=[f'<meta property="og:type" content="{"website" if noindex or "/" not in url.split("/explore/"+LANG+"/")[1][:-5] else "article"}">',
     '<meta property="og:site_name" content="Lokali">',
     f'<meta property="og:locale" content="{D.LOCALE}">',f'<meta property="og:title" content="{esc(title)}">',
     f'<meta property="og:description" content="{esc(desc)}">',f'<meta property="og:url" content="{url}">']
    if img: L.append(f'<meta property="og:image" content="{esc(html.unescape(img))}">')
    L+=['<meta name="twitter:card" content="summary_large_image">',
     '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
     '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,500;0,600;1,500&display=swap" rel="stylesheet">',
     '<script type="application/ld+json">',json.dumps(g,ensure_ascii=False),'</script>',
     '<style>'+CSS+'</style>','</head>','<body>','<div class="page">',
     f'<header class="topbar"><a href="{BASE}" class="brand">Lokali</a></header>']
    return NL.join(L)

def crumb(a,leaf=None):
    cb=(f'<a href="{BASE}/explore/en/country/{a["country_slug"]}.html">{txt(a["country"])}</a>'
        if a['country_slug'] in HAVE_C else f'<span>{txt(a["country"])}</span>')
    tail=(f'<a href="{BASE}/explore/{LANG}/{a["city"]}.html">{txt(a["city_disp"])}</a> '
          f'<span class="sep">&rsaquo;</span> <span>{txt(leaf)}</span>') if leaf else f'<span>{txt(a["city_disp"])}</span>'
    return ('<nav class="crumbs" aria-label="Breadcrumb">'
      f'<a href="{BASE}">Lokali</a> <span class="sep">&rsaquo;</span> '
      f'<a href="{BASE}/explore/index.html">Explore</a> <span class="sep">&rsaquo;</span> '
      f'{cb} <span class="sep">&rsaquo;</span> {tail}</nav>')

def cta(cs):
    return (f'<div class="cta-row">{NL}<a href="{esc(PLAY+cs)}" class="cta" rel="nofollow">'
            f'<span class="play">&#9654;</span><span class="lbl"><small>{D.UI["begin"]}</small>'
            f'<b>{D.UI["open"]}</b></span></a>{NL}</div>')

def verified():
    return (f'<p class="verified">&#10003; <b>{D.UI["verified"]}</b> &middot; '
            f'<a href="{EDIT}">{D.UI["howwrite"]}</a></p>')

def page(a,nearby):
    t=a['title']; city=a['city_disp']; cs=a['city']
    url=f"{BASE}/explore/{LANG}/{cs}/{a['slug']}.html"
    ans=answer(a)
    F=D.faq(t,city,a['country'],a['visit'],mins(a['dur_sec']),a['tips'],a['key_facts'],a['lat'],a['lng'])
    title=D.TITLE.format(t=t,city=city)
    if len(title)>MAXTITLE: title=D.TITLE_SHORT.format(t=t)
    if len(title)>MAXTITLE: title=f"{t} — Lokali"
    desc=shrink(ans,MAXDESC)
    ta={"@type":"TouristAttraction","@id":url+"#attraction","name":t,"description":ans,"url":url,
        "isAccessibleForFree":True,"publicAccess":True,"inLanguage":LANG}
    if a['image']: ta["image"]=html.unescape(a['image'])
    if a['lat'] is not None:
        ta["geo"]={"@type":"GeoCoordinates","latitude":a['lat'],"longitude":a['lng']}
        ta["hasMap"]=f"https://www.google.com/maps/search/?api=1&query={a['lat']}%2C{a['lng']}"
    ta["address"]={"@type":"PostalAddress","addressLocality":city,"addressCountry":a['cc']}
    if a['type']: ta["additionalType"]=a['type']
    cr=[{"@type":"ListItem","position":1,"name":"Lokali","item":BASE},
        {"@type":"ListItem","position":2,"name":"Explore","item":f"{BASE}/explore/index.html"}]
    pos=3
    if a['country_slug'] in HAVE_C:
        cr.append({"@type":"ListItem","position":pos,"name":a['country'],
                   "item":f"{BASE}/explore/en/country/{a['country_slug']}.html"}); pos+=1
    cr+=[{"@type":"ListItem","position":pos,"name":city,"item":f"{BASE}/explore/{LANG}/{cs}.html"},
         {"@type":"ListItem","position":pos+1,"name":t,"item":url}]
    g={"@context":"https://schema.org","@graph":[ta,{"@type":"BreadcrumbList","itemListElement":cr},
       {"@type":"FAQPage","mainEntity":[{"@type":"Question","name":q,
        "acceptedAnswer":{"@type":"Answer","text":aa}} for q,aa in F]}]}
    L=[head(title,desc,url,a['image'],g), crumb(a,t)]
    if a['image']:
        L.append(f'<div class="hero-img"><img src="{esc(html.unescape(a["image"]))}" '
                 f'alt="{esc(t+", "+city)}" loading="eager" width="600" height="480">'
                 f'<div class="ov"></div><span class="badge">{D.UI["badge"]}</span></div>')
    L.append(f'<h1>{txt(t)}</h1>')
    geo=[]
    if a['lat'] is not None:
        geo.append(f"{abs(a['lat']):.4f}&deg; {'N' if a['lat']>=0 else 'S'} &middot; "
                   f"{abs(a['lng']):.4f}&deg; {'E' if a['lng']>=0 else 'W'}")
    tp=D.type_phrase(a['type'])
    if tp: geo.append(txt(tp.split(' ',1)[-1]))
    if geo: L.append('<p class="geoline">'+' &middot; '.join(geo)+'</p>')
    L+= [f'<p class="answer">{txt(ans)}</p>', verified(), cta(cs)]
    rws=[]
    if a['visit']: rws.append((D.ROW['time'],txt(a['visit'])))
    rws.append((D.ROW['audio'],f"{mins(a['dur_sec'])} {D.UI['min']} &middot; {D.UI['free']}"))
    if tp: rws.append((D.ROW['type'],txt(tp.split(' ',1)[-1])))
    if D.CAT.get(a['category']): rws.append((D.ROW['best'],D.CAT[a['category']]))
    rws.append((D.ROW['loc'],txt(f"{city}, {a['country']}")))
    if a['lat'] is not None: rws.append((D.ROW['coord'],f'<span translate="no">{a["lat"]}, {a["lng"]}</span>'))
    rws.append((D.ROW['langs'],D.UI['langval']))
    L.append(f'<section>{NL}<h2 class="sec">{D.SEC["visitor"]}</h2>{NL}<table class="facts-tbl"><tbody>')
    for k2,v in rws: L.append(f'<tr><th>{k2}</th><td>{v}</td></tr>')
    L.append('</tbody></table>'+NL+'</section>')
    paras=[x.strip() for x in re.split(r'\n\s*\n',a['script'] or '') if x.strip()]
    if paras:
        L.append(f'<section>{NL}<h2 class="sec">{D.SEC["story"]}</h2>{NL}<div class="tour">')
        for x in paras: L.append(f'<p>{txt(x)}</p>')
        L.append('</div>'+NL+'</section>')
    for cls,h,its in (('facts',D.SEC['facts'],a['key_facts']),('look',D.SEC['look'],a['look_for']),
                      ('tips',D.SEC['tips'],a['tips'])):
        if not its: continue
        L.append(f'<section>{NL}<h2 class="sec">{h}</h2>{NL}<div class="chips {cls}">')
        for x in its: L.append(f'<div class="item">{IC[cls]}<span>{txt(x)}</span></div>')
        L.append('</div>'+NL+'</section>')
    L.append(f'<section>{NL}<h2 class="sec">{D.SEC["faq"]}</h2>{NL}<div class="faq">')
    for q,aa in F: L.append(f'<h3>{txt(q)}</h3>{NL}<p>{txt(aa)}</p>')
    L.append('</div>'+NL+'</section>')
    if nearby:
        L.append(f'<section>{NL}<h2 class="sec">{txt(MORE(city))}</h2>{NL}<div class="nearby">')
        for nm,sl,km in nearby[:6]:
            L.append(f'<a href="{BASE}/explore/{LANG}/{cs}/{sl}.html">{txt(nm)}<span class="km">{km:.1f} km</span></a>')
        L.append('</div>'+NL+'</section>')
    if a['lat'] is not None:
        q=f"{a['lat']}%2C{a['lng']}"
        L.append(f'<section>{NL}<h2 class="sec">{D.SEC["map"]}</h2>{NL}<div class="mapcard">'
          f'<a href="https://www.google.com/maps/search/?api=1&amp;query={q}" target="_blank" '
          f'rel="noopener noreferrer"><span class="ic">{ICM}</span>{D.UI["maps"]}'
          f'<span class="arr">&rsaquo;</span></a></div>{NL}'
          f'<p class="map-note">{D.SENT["route"].format(t=txt(t))}</p>{NL}</section>')
    cf=(f'<a href="{BASE}/explore/en/country/{a["country_slug"]}.html">{txt(GUIDES_IN(a["country"]))}</a> &middot; '
        if a['country_slug'] in HAVE_C else '')
    L.append(f'{NL}<footer>{NL}<a href="{BASE}/explore/index.html">{D.UI["allcities"]}</a> &middot; '
             + cf + f'<a href="{BASE}/explore/{LANG}/{cs}.html">{txt(city)}</a> &middot; '
             f'<a href="{EDIT}">{D.UI["editorial"]}</a>{NL}</footer>')
    L.append(PBAR.replace('utm_content=istanbul','utm_content='+cs))
    L+=['</div>','</body>','</html>']
    return NL.join(L)

def hub(cs,items):
    items=sorted(items,key=lambda x:x['title']); a=items[0]; n=len(items)
    city=a['city_disp']; url=f"{BASE}/explore/{LANG}/{cs}.html"
    names=', '.join(i['title'] for i in items[:3])
    # Languages with grammatical number agreement (Russian: 1 аудиогид /
    # 2 аудиогида / 5 аудиогидов) cannot be served by a plain format string, so a
    # strings module may supply hub_text() and build the three strings itself.
    if hasattr(D,'hub_text'):
        title,desc,intro=D.hub_text(city,n,names)
        if len(title)>MAXTITLE+2 and hasattr(D,'hub_text_short'): title=D.hub_text_short(city,n)
    else:
        title=D.HUB_TITLE.format(city=city,n=n)
        if len(title)>MAXTITLE+2: title=D.HUB_TITLE_SHORT.format(city=city,n=n)
        desc=D.HUB_DESC.format(n=n,city=city,names=names)
        intro=D.HUB_INTRO.format(n=n,city=city)
    desc=shrink(desc,MAXDESC)
    F=D.hub_faq(city,n)
    g={"@context":"https://schema.org","@graph":[
      {"@type":"TouristDestination","name":city,"url":url,"inLanguage":LANG,"description":intro,
       "address":{"@type":"PostalAddress","addressLocality":city,"addressCountry":a['cc']}},
      {"@type":"ItemList","numberOfItems":n,"itemListElement":[
        {"@type":"ListItem","position":k+1,"name":i['title'],
         "url":f"{BASE}/explore/{LANG}/{cs}/{i['slug']}.html"} for k,i in enumerate(items)]},
      {"@type":"FAQPage","mainEntity":[{"@type":"Question","name":q,
        "acceptedAnswer":{"@type":"Answer","text":x}} for q,x in F]}]}
    img=next((i['image'] for i in items if i['image']),None)
    L=[head(title,desc,url,img,g,noindex=n<2), crumb(a), f'<h1>{txt(city)}</h1>',
       f'<p class="answer">{txt(intro)}</p>', verified(), cta(cs),
       f'<section>{NL}<h2 class="sec">{txt(MORE(city))}</h2>{NL}<div class="nearby">']
    for i in items:
        L.append(f'<a href="{BASE}/explore/{LANG}/{cs}/{i["slug"]}.html">{txt(i["title"])}'
                 f'<span class="km">{mins(i["dur_sec"])} {D.UI["min"]}</span></a>')
    L.append('</div>'+NL+'</section>')
    L.append(f'<section>{NL}<h2 class="sec">{D.SEC["faq"]}</h2>{NL}<div class="faq">')
    for q,x in F: L.append(f'<h3>{txt(q)}</h3>{NL}<p>{txt(x)}</p>')
    L.append('</div>'+NL+'</section>')
    L.append(f'{NL}<footer>{NL}<a href="{BASE}/explore/index.html">{D.UI["allcities"]}</a> &middot; '
             f'<a href="{EDIT}">{D.UI["editorial"]}</a>{NL}</footer>')
    L.append(PBAR.replace('utm_content=istanbul','utm_content='+cs))
    L+=['</div>','</body>','</html>']
    return NL.join(L)

def wr(rel,h):
    for p in (os.path.join(OUT,rel), os.path.join(OUT,rel[:-5],'index.html')):
        os.makedirs(os.path.dirname(p),exist_ok=True)
        open(p,'w',encoding='utf-8').write(h)

if __name__=='__main__':
    items=build(); print("buildable:",len(items))
    by=defaultdict(list)
    for a in items: by[a['city']].append(a)
    exist=set()
    for r,_,fs in os.walk(OUT):
        for f in fs:
            if f.endswith('.html') and f!='index.html':
                exist.add(os.path.relpath(os.path.join(r,f),OUT).replace(os.sep,'/')[:-5])
    n=h_=0
    for a in items:
        # The v3 generator put every language on the English slug, so a rich
        # hand-built page may already exist at <city>/<en-slug>.html. Building a
        # second page on a localised slug would publish the same attraction at
        # two URLs; the existing page wins.
        en=enslug.get(a['key'])
        if en and en[0]==a['city'] and f"{en[0]}/{en[1]}" in exist: continue
        if f"{a['city']}/{a['slug']}" in exist: continue
        sib=sorted(((x['title'],x['slug'],dist((a['lat'],a['lng']),(x['lat'],x['lng'])))
                    for x in by[a['city']] if x is not a and a['lat'] is not None and x['lat'] is not None),
                   key=lambda z:z[2])
        wr(f"{a['city']}/{a['slug']}.html", page(a,sib)); n+=1
    for cs,its in by.items():
        if os.path.exists(os.path.join(OUT,cs+'.html')): continue
        wr(cs+'.html', hub(cs,its)); h_+=1
    print(f"attraction pages written: {n}   city hubs: {h_}   cities: {len(by)}")
    json.dump(items,open(f'{WD}/built.json','w'),ensure_ascii=False)
