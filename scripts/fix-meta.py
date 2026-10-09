# -*- coding: utf-8 -*-
"""Bring <title> and <meta name="description"> inside what a SERP actually shows.

Why: 1,575 of the 2,139 indexable pages carried a ~300-character description and
230 carried a title over 62 characters. Neither is a penalty, but Google cuts the
snippet at roughly 160 characters and the title at roughly 60, and Bing Webmaster
Tools reports both as errors. The part being cut was the end of the string --
which is where "Free Audio Guide" and the brand live.

What it does NOT do: invent text. The description is rebuilt only from the
sentences already in it, keeping whole sentences; the title only drops parts of
the existing formula. Nothing new is written.

  python3 scripts/fix-meta.py --dry-run
  python3 scripts/fix-meta.py
"""
import os,re,sys,html,json
from concurrent.futures import ThreadPoolExecutor

EXP=os.environ.get('EXPLORE_DIR') or os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),'public','explore')
DRY='--dry-run' in sys.argv
MAXD,MAXT=158,62
# Only rewrite a description that is clearly past what Google shows. The old v3
# pages already sit at exactly 160 with their own ellipsis; re-trimming those to
# 153 would rewrite a thousand files to gain seven characters.
TRIGGER=165

# A period does not end a sentence after an initial or an abbreviation, and the
# pages are full of them: "Antiochus I. von Kommagene", "el siglo I a. C.",
# "av. J.-C.", "до н. э.". Anything up to two letters before the dot is treated
# as an abbreviation -- merging two sentences by mistake only costs us a shorter
# description, while splitting one by mistake prints a mangled sentence.
ABBR=re.compile(r'(?:^|\s)(?:\w{1,2}|Dr|Mrs|Jr|Nr|bzw|ca|etc|vgl|apr|env|Chr|'
                r'сокр|гг)\.$',re.UNICODE)
def sentences(t):
    parts=re.split(r'(?<=[.!?])\s+',t.strip())
    out=[]
    for p in parts:
        if out and ABBR.search(out[-1]): out[-1]+=' '+p
        else: out.append(p)
    # A trailing "..." fragment is the previous generator's own mid-sentence cut,
    # not a sentence. Re-using it would print "the free guide runs 6..." forever.
    if out and out[-1].endswith('\u2026'): out.pop()
    return [x for x in out if x]

def _fill(parts,limit):
    keep=''
    for x in parts:
        cand=(keep+' '+x).strip()
        if len(cand)<=limit: keep=cand
        else: break
    return keep

def shrink_desc(d):
    if len(d)<=TRIGGER: return d
    S=sentences(d)
    # The sentence naming the free Lokali guide is the one selling point in the
    # string and it is always last -- exactly the part truncation eats. Reserve
    # room for it, but only if whole sentences still fit in front of it.
    hook=S[-1] if len(S)>1 and 'Lokali' in S[-1] else None
    if hook:
        keep=_fill(S[:-1],MAXD-len(hook)-1)
        if keep: return keep+' '+hook
    keep=_fill(S,MAXD)
    if keep: return keep
    cut=d[:MAXD-1].rsplit(' ',1)[0]
    return re.sub(r'[\s\u2014\u2013,;:-]+$','',cut)+'…'   # never end on a dangling dash

# "<name>, <city> — Free Audio Guide | Lokali" -> drop the city, then the brand
EN=re.compile(r'^(.*?), ([^,]+) — Free Audio Guide \| Lokali$')
def shrink_title(t):
    if len(t)<=MAXT: return t
    m=EN.match(t)
    if not m: return t                               # a formula this does not know
    n=m.group(1)
    for cand in (f'{n} — Free Audio Guide | Lokali',
                 f'{n} — Free Audio Guide',
                 f'{n} — Lokali'):
        if len(cand)<=MAXT: return cand
    return f'{n} — Free Audio Guide'                 # keep the hook over the brand

files=[]
for lang in sorted(os.listdir(EXP)):
    d=os.path.join(EXP,lang)
    if not os.path.isdir(d): continue
    for root,_,fs in os.walk(d):
        for f in fs:
            if f.endswith('.html') and f!='index.html':
                files.append(os.path.relpath(os.path.join(root,f),EXP).replace(os.sep,'/'))

T=re.compile(r'<title>([^<]*)</title>')
DM=re.compile(r'(<meta name="description" content=")([^"]*)(">)')
OG=re.compile(r'(<meta property="og:description" content=")([^"]*)(">)')
OGT=re.compile(r'(<meta property="og:title" content=")([^"]*)(">)')

changed={}; stats={'title':0,'desc':0,'skipped_title':[]}
def work(rel):
    p=os.path.join(EXP,rel)
    s=open(p,encoding='utf-8',errors='ignore').read()
    if 'name="robots" content="noindex' in s: return None
    tm=T.search(s); dm=DM.search(s)
    if not (tm and dm): return None
    t0=html.unescape(tm.group(1)); d0=html.unescape(dm.group(2))
    t1,d1=shrink_title(t0),shrink_desc(d0)
    if t1==t0 and d1==d0: return None
    new=s
    if d1!=d0:
        e=html.escape(d1,quote=True)
        new=DM.sub(lambda m:m.group(1)+e+m.group(3),new,count=1)
        new=OG.sub(lambda m:m.group(1)+e+m.group(3),new,count=1)
    if t1!=t0:
        e=html.escape(t1,quote=True)
        new=T.sub(lambda m:'<title>'+html.escape(t1,quote=False)+'</title>',new,count=1)
        new=OGT.sub(lambda m:m.group(1)+e+m.group(3),new,count=1)
    return rel,new,(t0,t1),(d0,d1)

with ThreadPoolExecutor(48) as ex: res=[r for r in ex.map(work,files) if r]
# The FUSE mount writes at roughly 1 file/s per thread and each page has an
# extensionless twin, so a full pass can outrun the shell's time limit. The pass
# is idempotent -- a page already correct is not in `res` -- so it is safe to cap
# the batch and simply run the script again until it reports 0.
LIMIT=int(os.environ.get('FIX_META_LIMIT') or 0)
if LIMIT: res=res[:LIMIT]
for rel,new,(t0,t1),(d0,d1) in res:
    changed[rel]=new
    if t1!=t0: stats['title']+=1
    if d1!=d0: stats['desc']+=1
    if len(t1)>MAXT: stats['skipped_title'].append((len(t1),t1))
print(f'pages changed: {len(changed)}   titles: {stats["title"]}   descriptions: {stats["desc"]}')
print(f'titles still over {MAXT} (name alone is that long): {len(stats["skipped_title"])}')
for n,t in sorted(stats['skipped_title'],reverse=True)[:5]: print(f'   {n} {t}')

print('\nsamples:')
seen=set()
for rel,new,(t0,t1),(d0,d1) in res:
    lg=rel.split('/')[0]
    if lg in seen: continue
    seen.add(lg)
    if len(seen)>7: break
    print(f'\n## {rel}')
    if t1!=t0: print(f'  title {len(t0)} -> {len(t1)}\n    - {t0}\n    + {t1}')
    if d1!=d0: print(f'  desc  {len(d0)} -> {len(d1)}\n    - {d0[:200]}\n    + {d1}')

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
if DRY:
    print('\nDRY RUN - nothing written')
else:
    with ThreadPoolExecutor(32) as ex: list(ex.map(wr,changed.items()))
    json.dump(sorted('https://lokali.travel/explore/'+r for r in changed),
              open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'last-meta-change.json'),'w'))
    print('\nwritten')
