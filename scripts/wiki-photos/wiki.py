import json,urllib.request,urllib.parse as up,math,re,sys
UA={'User-Agent':'LokaliExploreBot/1.0 (https://lokali.travel; beka.lokali@example) python-urllib'}
def api(host,params):
    q=up.urlencode({**params,'format':'json','formatversion':'2'})
    return json.load(urllib.request.urlopen(urllib.request.Request(f'https://{host}/w/api.php?{q}',headers=UA),timeout=30))
def dist(a,b,c,d):
    return math.hypot((b-d)*111*math.cos(math.radians(a)),(a-c)*111)
def find(name,city,lat,lng):
    """search en.wikipedia; accept a page whose coordinates are within 8 km and that has a free lead image"""
    r=api('en.wikipedia.org',{'action':'query','generator':'search','gsrsearch':f'{name} {city}','gsrlimit':'6',
        'prop':'pageimages|coordinates','piprop':'original|name','pilicense':'free','colimit':'max'})
    best=None
    for p in sorted(r.get('query',{}).get('pages',[]),key=lambda p:p.get('index',99)):
        co=(p.get('coordinates') or [None])[0]
        if not co or 'pageimage' not in p: continue
        d=dist(lat,lng,co['lat'],co['lon']) if lat is not None else None
        if d is not None and d<=8:
            best=(p['title'],p['pageimage'],round(d,2)); break
    return best
def meta(fname):
    r=api('commons.wikimedia.org',{'action':'query','titles':'File:'+fname,'prop':'imageinfo','iiprop':'extmetadata|size|mime','iiurlwidth':'1280'})
    p=r['query']['pages'][0]; ii=p['imageinfo'][0]; m=ii.get('extmetadata',{})
    g=lambda k: re.sub('<[^>]+>','',(m.get(k) or {}).get('value','')).strip()
    return {'thumb':ii.get('thumburl'),'w':ii.get('width'),'h':ii.get('height'),'mime':ii.get('mime'),
            'artist':g('Artist')[:80],'license':g('LicenseShortName'),'desc_url':'https://commons.wikimedia.org/wiki/File:'+up.quote(fname.replace(' ','_'))}
if __name__=='__main__':
    b=find('Lake Salda','Burdur',37.55,29.68); print(b)
    if b: print(meta(b[1]))
