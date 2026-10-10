# Building /explore/&lt;lang&gt;/ pages from the guide database

`gen.py` turns rows that already exist in Supabase `cached_guides` into static
pages. **It does not translate anything.** The guide text, key facts, "what to
look for", tips and the title all come out of the database in that language,
word for word. The only per-language thing in this folder is the template
chrome — section headings, table labels, FAQ wording, and the one sentence
frame that wraps DB facts — which lives in a small strings module.

Built so far: `en` (1,494), `ka` (195), `de` (175), `ru` (172), `nl` (167),
`zh-cn` (167), `fr` (163), `pl` (163), `es` (161), `tr` (138). 2,704 indexable
URLs in total.

## Run

> **These are build scripts, not something you run by hand.** The pages in
> `public/explore/` are committed to the repo — generating them is Claude's job
> and the output is already in the checkout. Nothing here needs running before a
> push. The commands below are for whoever regenerates a language next.

`gen.py` needs a **data directory** that is not in the repo: the guide export
plus the page assets. Point `GEN_DATA_DIR` at it and `EXPLORE_DIR` at the
checkout:

```bash
export EXPLORE_DIR=public/explore          # defaults to ../public/explore
export GEN_DATA_DIR=/tmp/ru                # the export + assets, see table below
python3 scripts/gen.py ru rustr            # <lang-dir> <strings-module>
python3 scripts/link-langs.py /tmp/ru/built.json   # ALWAYS, see below
```

`link-langs.py` alone needs no data directory and is idempotent — running it
twice changes nothing the second time.

The data directory holds these (all produced by the `guides-export` edge
function, except the assets which are lifted from an existing EN page):

| file | what |
|---|---|
| `g_*.json` | `cached_guides` rows for that language |
| `facts.json` | name → lat/lng/type/duration, from `cached_attractions` (en) |
| `photos.json` | `cached_photos` rows |
| `todo.json` | attraction keys to consider |
| `style.css`, `ic_*.svg`, `playbar.html` | lifted from `explore/en/istanbul/hagia-sophia.html` |

Export endpoint (read-only, token-guarded):

```
/functions/v1/guides-export?lang=<code>&limit=200&offset=0&token=<token>
/functions/v1/guides-export?table=photos&limit=1000&offset=0&token=<token>
/functions/v1/guides-export?table=attractions&lang=en&limit=200&offset=0&token=<token>
```

## link-langs.py owns hreflang, the sitemap and llms.txt

**Run `link-langs.py` after every batch, and never write a per-language link
step again.** Each batch used to ship its own small linker, and every one of
them *replaced* the `<link rel="alternate">` block on the pages it touched
instead of merging into it. After the `de` batch the EN pages listed
`{en,de}`; after the `es` batch they listed `{en,es}` and `tr` and `de` had
silently disappeared. hreflang only counts when it is reciprocal, so almost
every annotation in the tree was being thrown away by search engines. New URLs
were also appended to the sitemap with no `<xhtml:link>` at all, which put the
sitemap in direct conflict with the pages.

`link-langs.py` rebuilds the whole model in one pass: it recovers the
cross-language grouping as connected components of every hreflang edge in the
tree, re-derives the batch languages from their `built.json` manifests, then
rewrites the alternate block, the language dropdown, `sitemap-explore.xml` and
`llms.txt` from that one model. It refuses to write if any group ends up with
two indexable pages in the same language.

`--dry-run` prints the plan and writes nothing.

Note that `build-explore-hub.mjs` must only ever **append** to the sitemap —
`link-langs.py` is what regenerates it.

## Adding a language

Copy `frstr.py` and translate ~15 labels. Three parts need real care:

1. **`T` — the noun each attraction type maps to, and its grammatical gender**,
   because the answer sentence needs the right article:

   ```python
   'Museum':('musée','m')     ->  "est un musée à Lyon, France."
   'Mosque':('mosquée','f')   ->  "est une mosquée à Istanbul, Turquie."
   ```

   German needs the same (`das Museum` → *ein*, `die Moschee` → *eine*).
   Russian needs none — no articles — but see below. Turkish needed something
   harder (vowel harmony plus the possessive-compound buffer: `Topkapı Sarayı`
   + locative → `Sarayı'nda`, not `Sarayı'da`) so it has its own `trlib.py`.

2. **Non-Latin scripts: either `translit(s)` or `USE_EN_SLUG`.**
   `USE_EN_SLUG = True` puts the pages on the English slug, which is what the
   older v3 pages already use (`explore/zh-cn/istanbul/hagia-sophia.html`) and
   what `ka` and `zh-cn` do. Otherwise supply `translit(s)`: Without it `slug()` strips the
   whole title, every page in a city lands on the same empty filename and they
   overwrite each other — this is exactly what happened on the first Russian
   run (138 pages collapsed into 47 files called `.html`). `gen.py` now refuses
   to build a page whose slug comes out empty, but the transliteration still
   has to be supplied. See `rustr.translit`.

3. **`hub_text()` / `hub_faq()` if the language has number agreement.** A plain
   format string cannot say *1 аудиогид / 2 аудиогида / 5 аудиогидов*, or
   *1 bezpłatny audioprzewodnik / 2 bezpłatne / 5 bezpłatnych*. Define
   `hub_text(city,n,names)` and gen.py will use it instead of `HUB_*`.

4. **Word order and punctuation hooks, for anything that is not Latin prose.**
   `where(city,country)` builds the location phrase (Chinese wants
   `Istanbul（土耳其）`, not `Istanbul, 土耳其`); `more_heading(city)` and
   `guides_in(country)` build the two headings that glue a name onto a label,
   because "<label> <City>" is a Latin word order with a Latin space in it;
   `SEP` and `STOP` set the sentence separator and full stop (Chinese: `''`
   and `。`); `MAXDESC` and `MAXTITLE` narrow the length budget, since a
   Chinese character is about twice as wide as a Latin one (zh-cn uses 78/34
   against the 158/62 default).

5. **Languages that decline place names** (Georgian, Polish, Russian) state the
   location after a colon in the nominative — `Lokalizacja: Istanbul, Turcja`,
   `მდებარეობა: Istanbul, თურქეთი` — and put the attraction name before a colon
   in FAQ questions, because the database stores city names in Latin script and
   they cannot take a case ending.

Also note: Russian FAQ questions use nominative-safe colon constructions
(`{X}: сколько времени нужно на осмотр?`) because attraction names cannot be
reliably declined.

Section headings for most languages already exist inside the pages built by the
old v3 generator (`explore/<lang>/istanbul/hagia-sophia.html`): lift them rather
than re-translating. ⚠️ Hindi is an exception — its v3 headings were left in
English, so check before trusting them.

`destr.py` was reconstructed from the live `/explore/de/` pages after the
original was lost; it reproduces the shipped wording exactly. ⚠️ Georgian is a
second Hindi: the v3 `ka` pages have English headings ("The story", "Key facts")
and one page titled from the *French* name, so nothing there was worth lifting —
`kastr.py` is written fresh.

## After generating

1. `python3 scripts/link-langs.py /tmp/<lang>/built.json`
2. push, then IndexNow the changed URLs
3. the sitemap URL never changes, so Google re-reads it on its own

## What it will not do

- build a page for a language that has no guide row — no machine translation
- invent coordinates; a page with no lat/lng simply has no map, no geo schema
  and no "where is it" question
- publish two pages for one slug. The DB holds alias rows (`duden waterfall` /
  `duden waterfalls`, `ortakoy` / `ortakoy mosque`) and in some languages two
  genuinely different places share one localised title. `gen.py` keeps the
  richest payload per slug and logs the rest to `collisions.json`.

## Known data issues, not code issues

- `no-en-sibling.json` — 7 batch pages whose attraction has no EN page at all
  (David Gareja, Josefov, Notre Dame des Anges, Balıklıgöl …). They ship with no
  hreflang, which is correct.
- `en/beyoğlu/istiklal-avenue.html` vs `istiklal-street.html`, and
  `en/istanbul/hippodrome-of-constantinople.html` vs `sultanahmet-square.html`,
  are the same place twice. Both pairs are live and indexed; decide with GSC
  impression data which to keep before canonicalising one into the other. Do
  **not** merge Düden — `duden-waterfalls` (upper) and `düden-waterfall`
  (lower) are 2.6 km apart and genuinely different.
- meta descriptions run to ~300 characters on 1,653 pages across the whole tree
  (EN included, and predating these batches). Google truncates the snippet at
  ~160 and Bing flags it. Worth one deliberate pass, not a per-batch fix.
