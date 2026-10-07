import re,unicodedata
MAP={'ç':'c','ğ':'g','ı':'i','ö':'o','ş':'s','ü':'u','İ':'i','î':'i','â':'a','ø':'o','æ':'ae','ß':'ss','ł':'l','å':'a','đ':'d'}
def deacc(s):
    s=''.join(MAP.get(c,c) for c in (s or ''))
    s=unicodedata.normalize('NFKD',s)
    return ''.join(c for c in s if not unicodedata.combining(c))
def key(s):
    s=deacc(s).lower(); s=re.sub(r"[’'`´]","",s)
    return re.sub(r'[^a-z0-9]+',' ',s).strip()
def slug(s): return re.sub(r'[^a-z0-9]+','-',deacc(s).lower()).strip('-')
