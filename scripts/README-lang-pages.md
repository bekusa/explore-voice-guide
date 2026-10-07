# Building /explore/&lt;lang&gt;/ pages from the guide database

`gen.py` turns rows that already exist in Supabase `cached_guides` into static
pages. **It does not translate anything.** The guide text, key facts, "what to
look for", tips and the title all come out of the database in that language,
word for word. The only per-language thing in this folder is the template
chrome — section headings, table labels, FAQ wording, and the one sentence
frame that wraps DB facts — which lives in a small strings module.

Built so far: `en` (1,190), `tr` (109), `de` (134), `es` (129).

## Run

```bash
python3 scripts/gen.py es esstr      # <lang-dir> <strings-module>
```

It expects these files next to it (all produced by the `guides-export` edge
function, except the assets which are lifted from an existing EN page):

| file | what |
|---|---|
| `g_*.json` | `cached_guides` rows for that language |
| `facts.json` | name → lat/lng/type/duration, from `cached_attractions` (en) |
| `photos.json` | `cached_photos` rows |
| `todo.json` | attraction keys that do not have a page yet |
| `style.css`, `ic_*.svg`, `playbar.html` | lifted from `explore/en/istanbul/hagia-sophia.html` |

Export endpoint (read-only, token-guarded):

```
/functions/v1/guides-export?lang=<code>&limit=200&offset=0&token=<token>
/functions/v1/guides-export?table=photos&limit=1000&offset=0&token=<token>
/functions/v1/guides-export?table=attractions&lang=en&limit=200&offset=0&token=<token>
```

## Adding a language

Copy `esstr.py` and translate ~15 labels. The one part that needs real care is
`T` — the noun each attraction type maps to **and its grammatical gender**,
because the answer sentence needs the right article:

```python
'Museum':('museo','m')     ->  "es un museo en Sevilla, España."
'Mosque':('mezquita','f')  ->  "es una mezquita en Estambul, Turquía."
```

German needs the same (`das Museum` → *ein*, `die Moschee` → *eine*). Turkish
needed something harder — vowel harmony and the possessive-compound buffer
(`Topkapı Sarayı` + locative → `Sarayı'nda`, not `Sarayı'da`) — so it has its
own `trlib.py` rather than this table.

Section headings for most languages already exist inside the pages built by the
old v3 generator (`explore/<lang>/istanbul/hagia-sophia.html`): lift them rather
than re-translating. ⚠️ Hindi is an exception — its v3 headings were left in
English, so check before trusting them.

## After generating

1. hreflang + sitemap + `llms.txt` — see the link step in the session notes
2. push, then IndexNow the changed URLs
3. the sitemap URL never changes, so Google re-reads it on its own

## What it will not do

- build a page for a language that has no guide row — no machine translation
- invent coordinates; a page with no lat/lng simply has no map, no geo schema
  and no "where is it" question
- overwrite a page that already exists
