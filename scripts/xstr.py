# -*- coding: utf-8 -*-
"""Strings-module factory for gen.py, built from the label table in xstr_data.py.

Usage: a tiny per-language module calls make(<lang>) and exposes the result,
so gen.py sees the same SEC/ROW/UI/SENT/faq/hub API as the hand-written ones.
"""
import re as _re
from xstr_data import K, CK, L, C, META

def make(lang):
    v = dict(zip(K, L[lang])); assert len(L[lang]) == len(K), (lang, len(L[lang]))
    m = META[lang]; locale, dr = m[0], m[1]
    col = m[2] if len(m) > 2 else ': '
    stop = m[3] if len(m) > 3 else '.'
    sp = '' if lang == 'zh-tw' else ' '
    cm = {'zh-tw': '，', 'ur': '، '}.get(lang, ', ')
    S = lambda x: x + (stop if stop and not x.endswith(('?', '？', '.', '。', '։', '।', '۔')) else '')
    g = {}
    g['USE_EN_SLUG'] = True
    g['DIR'] = dr
    g['LOCALE'] = locale
    if lang == 'zh-tw':
        g['SEP'] = ''; g['STOP'] = '。'; g['MAXDESC'] = 78; g['MAXTITLE'] = 34
    elif lang == 'th':
        g['STOP'] = ''
    elif stop != '.':
        g['STOP'] = stop
    g['SEC'] = {k: v[k] for k in ('story', 'facts', 'look', 'tips', 'faq', 'map', 'visitor')}
    g['SEC']['more'] = v['more']
    g['ROW'] = {k: v[k] for k in ('time', 'audio', 'type', 'best', 'loc', 'coord', 'langs')}
    g['UI'] = {k: v[k] for k in ('badge', 'begin', 'open', 'verified', 'howwrite', 'maps', 'allcities',
                                 'editorial', 'langval', 'free', 'min', 'getapp')}
    g['UI']['guidesin'] = v['guides']
    g['CAT'] = {}
    g['COUNTRY'] = dict(zip(CK, C[lang]))
    g['more_heading'] = lambda city: f"{city} — {v['more']}"
    g['guides_in'] = lambda country: f"{v['guides']}{col}{country}"
    g['type_phrase'] = lambda t: None
    def dur(s):
        if not s: return None
        s = s.strip()
        s = _re.sub(r'\bhours?\b', v['h'], s); s = _re.sub(r'\bmin(utes)?\b', v['min'], s)
        return s
    g['dur'] = dur
    spend = S(f"{v['time']}{col}{{vis}}")
    runs = S(f"{v['audio']}{col}{{n}} {v['min']}{cm}{v['free']}")
    g['SENT'] = {'is': S(f"{{t}} — {v['loc']}{col}{{where}}"), 'in': S(f"{{t}} — {v['loc']}{col}{{where}}"),
                 'spend': spend, 'runs': runs, 'route': f"{{t}} — {v['route']}"}
    q = lambda t, k: f"{t}{col}{v[k]}"
    def faq(t, city, country, vis, mins, tips, kfs, lat, lng):
        a1 = ((spend.format(vis=vis) + sp) if vis else '') + runs.format(n=mins)
        o = [(q(t, 'q_time'), a1), (q(t, 'q_free'), v['a_free'])]
        if lat is not None:
            o.append((q(t, 'q_where'), S(f"{v['loc']}{col}{city}, {country}") + sp + S(f"{v['coord']}{col}{lat}, {lng}")))
        if tips: o.append((q(t, 'q_before'), tips[0]))
        if kfs: o.append((q(t, 'q_known'), kfs[0]))
        return o
    g['faq'] = faq
    g['TITLE'] = '{t}, {city} — ' + v['badge'] + ' | Lokali'
    g['TITLE_SHORT'] = '{t} — ' + v['badge'] + ' | Lokali'
    def hub_text(city, n, names):
        title = f"{city} — {v['guides']} ({n}) | Lokali"
        desc = f"{v['guides']}{col}{city} ({n}){col}{names}{stop}{sp}{v['note']}"
        intro = f"{v['guides']}{col}{city} ({n}){stop}{sp}{v['note']}"
        return title, desc, intro
    g['hub_text'] = hub_text
    g['hub_text_short'] = lambda city, n: f"{city} — {v['guides']} | Lokali"
    g['hub_faq'] = lambda city, n: [(f"{city}{col}{v['q_hub1']}", f"{n}{stop}{sp}{v['note']}"),
                                    (f"{city}{col}{v['q_hub2']}", v['a_hub2'])]
    return g
