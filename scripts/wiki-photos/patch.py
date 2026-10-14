import json,re,os,sys,html as H,urllib.parse as up
from concurrent.futures import ThreadPoolExecutor
P='/sessions/affectionate-awesome-planck/mnt/explore-voice-guide/public/explore/'
S=json.load(open('scan.json')); F=json.load(open('final.json')); M=json.load(open('meta.json')); U=json.load(open('urls.json'))
REJ={'CDRUSINDOPACOM_Visits_Port_Moresby_(Bomana)_War_Cemetery_(8529268).jpg','Liaquat_Bagh_Chowk_Rawalpindi.jpg'}
F={k:f for k,f in F.items() if f not in REJ}
def n(u): return up.unquote(u or '').replace('/index.html','.html')
c2k={}
for rel,v in S.items():
    if v['kind']=='attr' and v['hero']: c2k[n(v['can'])]=n(v['en'] or v['can'])
def img_for(url):
    k=c2k.get(n(url)); f=F.get(k) if k else None
    return f
card2hero={U[f]['card']:U[f]['hero'] for f in U}
esc=lambda s:H.escape(s or '',quote=True)
def credit(f):
    m=M[f]; a=esc(m.get('artist') or 'Wikimedia Commons'); lic=esc(m.get('license') or '')
    return f'<p class="credit">Photo: <a href="{esc(m["desc_url"])}" rel="nofollow noopener" target="_blank">{a}</a>{" &middot; "+lic if lic else ""} &middot; Wikimedia Commons</p>'
def set_og(s,img):
    if '<meta property="og:image"' in s:
        return re.sub(r'(<meta property="og:image" content=")[^"]*(")',lambda m:m.group(1)+img+m.group(2),s,count=1)
    return s.replace('<meta name="twitter:card"',f'<meta property="og:image" content="{img}">\n<meta name="twitter:card"',1)
def set_ld(s,img):
    def fix(m):
        try: d=json.loads(m.group(2))
        except Exception: return m.group(0)
        ch=False
        for node in (d.get('@graph') or [d]):
            if isinstance(node,dict) and node.get('@type') in ('TouristAttraction','TouristDestination') and not node.get('image'):
                node['image']=img; ch=True
        return m.group(1)+json.dumps(d,ensure_ascii=False)+m.group(3) if ch else m.group(0)
    return re.sub(r'(<script type="application/ld\+json">\s*)(.*?)(\s*</script>)',fix,s,flags=re.S)
def patch(rel):
    v=S[rel]; p=P+rel
    s=open(p,encoding='utf-8').read(); o=s
    # cards
    def ic(m):
        f=img_for(m.group(1))
        if not f: return m.group(0)
        return (f'<a class="icard" href="{m.group(1)}"><span class="ph"><img src="{U[f]["card"]}" alt="{m.group(4)}" loading="lazy" '
                f'decoding="async" width="500" height="333">{m.group(2)}</span><span class="tx"><small>{m.group(3)}</small><b>{m.group(4)}</b>')
    s=re.sub(r'<a class="icard" href="([^"]+)"><span class="ph noimg"><span class="ini">.*?</span>(.*?)</span><span class="tx"><small>(.*?)</small><b>(.*?)</b>',ic,s)
    def pc(m):
        f=img_for(m.group(1))
        if not f: return m.group(0)
        nm=re.search(r'<b>(.*?)</b>',m.group(2)).group(1)
        return (f'<a class="pcard" href="{m.group(1)}"><img src="{U[f]["card"]}" alt="{nm}" loading="eager" decoding="async" width="500" height="625">'
                + m.group(2))
    s=re.sub(r'<a class="pcard noimg" href="([^"]+)"><span class="ini">.*?</span>(<span class="cov"></span><span class="meta"><b>.*?</b>)',pc,s)
    # hero
    hero=None; cr=''
    if 'class="hero noimg"' in s:
        if v['kind']=='attr':
            f=img_for(v['can'])
            if f: hero=U[f]['hero']; cr=credit(f)
        else:
            m=re.search(r'<a class="icard" href="[^"]+"><span class="ph"><img src="([^"]+)"',s)
            if m: hero=card2hero.get(m.group(1)) or m.group(1)
    if hero:
        name=esc(H.unescape(re.sub('<[^>]+>','',v['name'])))
        s=s.replace('<section class="hero noimg"><span class="ov"></span>',
                    f'<section class="hero"><img src="{hero}" alt="{name}" fetchpriority="high" decoding="async"><span class="ov"></span>',1)
        if cr:
            i=s.find('<section class="hero">'); j=s.find('</section>',i)+len('</section>')
            s=s[:j]+'\n'+cr+s[j:]
        s=re.sub(r'<section class="apppanel noimg">(.*?)</section>',lambda m:'<section class="apppanel">'+m.group(1)+
                 f'<div class="ap-img"><img src="{hero}" alt="" loading="lazy" decoding="async"></div></section>',s,count=1,flags=re.S)
        hi=s.find('</head>'); head=set_og(s[:hi],hero); head=set_ld(head,hero); s=head+s[hi:]
    if s==o:
        if '--write' in sys.argv: open('/tmp/w/patched.txt','a').write(rel+'\n')
        return rel,'same'
    assert s.count('application/ld+json')==o.count('application/ld+json') and s.count('rel="alternate"')==o.count('rel="alternate"')
    if '--write' in sys.argv:
        t=p+'.tmp'; open(t,'w',encoding='utf-8').write(s); os.replace(t,p)
        open('/tmp/w/patched.txt','a').write(rel+'\n')
    else: open('/tmp/w/dry/'+rel.replace('/','__'),'w',encoding='utf-8').write(s)
    return rel,('hero' if hero else 'cards')
done=set(open('/tmp/w/patched.txt').read().split()) if os.path.exists('/tmp/w/patched.txt') else set()
files=[r for r in S if r not in done]
a,b=int(sys.argv[1]),int(sys.argv[2]); files=files[a:b] if '--write' not in sys.argv else files[:b]
import collections
with ThreadPoolExecutor(48) as ex: R=list(ex.map(patch,files))
print(collections.Counter(r[1] for r in R))
