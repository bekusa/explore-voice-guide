import json,re,time,unicodedata,os
from wiki import api,dist,meta
P=json.load(open('places.json'))
BAD=re.compile(r'(?i)(map|karte|locator|location|satellite|landsat|sentinel|nasa|from.space|logo|flag|coat.of.arms|plan\b|diagram|\.svg$|\.png$|\.tif|\.gif$)')
STOP=set('the of and at in on de la le du des el old town city museum park beach lake river church mosque palace ancient site ruins antik kenti ve golu plaji selalesi kanyonu sarayi adasi kilisesi carsisi harabeleri akropolu platosu batik sehri tapinagi mozolesi kaya mezarlari bazaar house'.split())
GENERIC=re.compile(r'(?i)(province|district|\(city\)|municipality|list of|neighbourhood|metropolitan)')
def norm(s): return re.sub(r'[^a-z0-9]+',' ',unicodedata.normalize('NFKD',(s or '').lower().replace('ı','i')).encode('ascii','ignore').decode()).strip()
def toks(s): return {t for t in norm(s).split() if t not in STOP and len(t)>2}
res=json.load(open('found2.json')) if os.path.exists('found2.json') else {}
import sys
T0=time.time()
for k,v in P.items():
    if k in res: continue
    if time.time()-T0>95: break
    parts=k.split('/explore/')[1][:-5].split('/')
    name=parts[-1].replace('-',' '); city=parts[-2].replace('-',' ') if len(parts)>2 else ''
    nt=toks(name) or set(norm(name).split()); geo=v['geo']
    cands={}
    try:
        for q in (name, f'{name} {city}'):
            r=api('en.wikipedia.org',{'action':'query','generator':'search','gsrsearch':q,'gsrlimit':'8','prop':'pageimages|coordinates','piprop':'name','pilicense':'free'})
            for p in r.get('query',{}).get('pages',[]): cands[p['title']]=p
        if geo:
            r=api('en.wikipedia.org',{'action':'query','generator':'geosearch','ggscoord':f'{geo[0]}|{geo[1]}','ggsradius':'3000','ggslimit':'15','prop':'pageimages|coordinates','piprop':'name','pilicense':'free'})
            for p in r.get('query',{}).get('pages',[]): cands[p['title']]=p
    except Exception as e:
        print('err',k,e); continue
    best=None
    for t,p in cands.items():
        img=p.get('pageimage')
        if not img or BAD.search(img) or GENERIC.search(t): continue
        co=(p.get('coordinates') or [None])[0]
        d=dist(geo[0],geo[1],co['lat'],co['lon']) if geo and co else None
        if geo and (d is None or d>5): continue
        ov=len(nt & toks(t))
        if ov==0: continue
        sc=(ov/len(nt), -(d or 0))
        if not best or sc>best[0]: best=(sc,t,img,d)
    if best:
        got={'title':best[1],'file':best[2],'km':None if best[3] is None else round(best[3],2),'ov':round(best[0][0],2)}
        m=meta(got['file']); got.update(m)
        if not (m['mime']=='image/jpeg' and (m['w'] or 0)>=640): got['reject']='size/mime'
        res[k]=got
    else: res[k]=None
    json.dump(res,open('found2.json','w'),ensure_ascii=False,indent=0)
json.dump(res,open('found2.json','w'),ensure_ascii=False,indent=0)
for k,v in res.items():
    s=k.split('/explore/')[1]
    print(('OK ' if v and 'file' in v and 'reject' not in v else 'REJ' if v and 'file' in v else '-- '), s[:44].ljust(44),'|',(v or {}).get('title','')[:28],'|',(v or {}).get('file','')[:40],(v or {}).get('km'),(v or {}).get('ov'))
