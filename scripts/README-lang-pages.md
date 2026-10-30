# Building /explore/&lt;lang&gt;/ pages from the guide database

`gen.py` turns rows that already exist in Supabase `cached_guides` into static
pages. **It does not translate anything.** The guide text, key facts, "what to
look for", tips and the title all come out of the database in that language,
word for word. The only per-language thing in this folder is the template
chrome — section headings, table labels, FAQ wording, and the one sentence
frame that wraps DB facts — which lives in a small strings module.

Built so far: `en`, `ka`, `ru`, `de`, `nl`, `fr`, `zh-cn`, `pl`, `ar`, `es`,
`fa`, `az`, `id`, `it`, `ja`, `ko`, `uk`, `bg`, `he`, `tr`, plus (2026-10-13)
`hr sr cs hu ro pt-br af da nb sv fi el hy vi ms sw th zh-tw hi mr bn ta te ur`
— 44 languages, **6,610 URLs in sitemap-explore.xml**.

The 2026-10-13 languages use `xstr.py` + `xstr_data.py` (one label table) instead
of a hand-written module each. Their sentence frames are "Label: value" and
"<Name>: question?", so no noun-gender or case tables are needed, and every
page sits on the English slug (`USE_EN_SLUG`).

After gen.py, run `lk_restyle.py` on the new files (see README-explore-design.md),
then `link-langs.py`.

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

4. **`DIR = 'rtl'` for right-to-left languages** (`ar`, `fa`, `he`). gen.py
   writes it onto `<html>`; without it the page renders left-to-right.

5. **Word order and punctuation hooks, for anything that is not Latin prose.**
   `where(city,country)` builds the location phrase (Chinese wants
   `Istanbul（土耳其）`, not `Istanbul, 土耳其`); `more_heading(city)` and
   `guides_in(country)` build the two headings that glue a name onto a label,
   because "<label> <City>" is a Latin word order with a Latin space in it;
   `SEP` and `STOP` set the sentence separator and full stop (Chinese: `''`
   and `。`); `MAXDESC` and `MAXTITLE` narrow the length budget, since a
   Chinese character is about twice as wide as a Latin one (zh-cn uses 78/34
   against the 158/62 default).

6. **Korean particles.** 은/는 and 이/가 depend on whether the preceding
   syllable ends in a consonant. Writing "은(는)" everywhere is the mark of an
   untranslated template; `kostr.py` computes it from the Hangul code point and
   gen.py passes it into the sentence as `{eun}`.

7. **Languages that decline place names** (Georgian, Polish, Russian) state the
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
original was lost; it reproduces the shipped wording exactly. ⚠️ Hindi is not the only language whose v3 pages were left in English: `ka` and
`az` are the same, and the Georgian Hagia Sophia page was even titled from the
*French* name. Check before lifting; `kastr.py` and `azstr.py` are written fresh.

## After generating

1. `python3 scripts/link-langs.py /tmp/<lang>/built.json`
2. push, then IndexNow the changed URLs
3. the sitemap URL never changes, so Google re-reads it on its own

## What it will not do

- build a page for a language that has no guide row — no machine translation
- invent coordinates; a page with no lat/lng simply has no map, no geo schema
  and no "where is it" question
- publish a second page for an attraction that already has one. The v3
  generator put every language on the English slug, so a rich hand-built page
  may already sit at `<city>/<en-slug>.html`; gen.py skips the attraction rather
  than adding a localised-slug twin. (This was found the hard way — the first
  batches produced duplicate Louvre, Hagia Sophia and Blue Mosque pages in six
  languages, all since canonicalised onto the richer original.)
- publish two pages for one slug. The DB holds alias rows (`duden waterfall` /
  `duden waterfalls`, `ortakoy` / `ortakoy mosque`) and in some languages two
  genuinely different places share one localised title. `gen.py` keeps the
  richest payload per slug and logs the rest to `collisions.json`.

## Known data issues, not code issues

- `no-en-sibling.json` — 7 batch pages whose attraction has no EN page at all
  (David Gareja, Josefov, Notre Dame des Anges, Balıklıgöl …). They ship with no
  hreflang, which is correct.
- Istiklal (street/avenue), Hippodrome/Sultanahmet Square and Balat/Fener and Balat
  were merged in every language on 2026-10-22 (see below). Do **not** merge Düden —
  `duden-waterfalls` (upper) and `düden-waterfall` (lower) are 2.6 km apart and
  genuinely different.
- 56 attractions have no photo anywhere in `cached_photos`, so their pages ship
  without an image in every language. That is a database gap, not a matching
  bug: a looser name match over all 35,760 photo rows recovered exactly one.
- `zh-cn/paris/louvre.html` is 5,646 characters against 11,039 for the
  Traditional Chinese twin. The Louvre project's Simplified Chinese text is
  simply shorter; nothing in the pipeline truncated it.
- Non-ASCII URLs (`en/istanbul/gülhane-park.html`) are **fine**. They serve 200,
  they are in the sitemap, and Google handles percent-encoded UTF-8. Renaming
  them would abandon indexed URLs for cosmetics — leave them alone.

## App /attraction/ pages point at /explore/ (2026-10-22)

The app's `/attraction/$id` page server-renders ~40 words, so it now names the
matching `/explore/` page as its canonical, or sends `noindex, follow` when no
page matches (or the name belongs to two places, e.g. "Old Town", the two Düden
waterfalls). The lookup is `src/lib/exploreCanonical.generated.ts`, built from
the pages' own `<h1>`, canonical, robots and the hreflang groups in
`sitemap-explore.xml`:

    python3 scripts/build-explore-canonical.py

**Re-run it whenever pages are added, merged or noindexed**, then commit and
Publish (it lives in `src/`). Merging a duplicate pair also un-blocks the app
page for that name — the script lists every ambiguous name it skipped.

## Duplicate merges, canonical groups and coordinates (2026-10-22)

**link-langs.py now joins a page to its canonical target's hreflang group.** A
page whose canonical names another page is the same place, so the two groups
merge, and the one-indexable-page-per-language check then names every
language that still has both versions. Fix those by aliasing (canonical →
keeper + `noindex, follow` + og:url), never by deleting.

Merged on 2026-10-22 (alias → kept): en Narikala → `nariqala-fortress` (1,309
words vs 349; ka keeps `narikala-fortress`), 606 Trail and The Bean
(`abuja/` → `chicago/`), Ortaköy `-2`, V&A `va-` → `v-a-`, Spinalonga
`plaka/` → `crete/spinalonga-fortress`, Pierre Loti `istanbul/` →
`eyüpsultan/`, Göreme `-2`, Kremlin → `moscow-kremlin`, 9/11 → `911-`,
C&O → `co-canal`, Big → Giant Wild Goose Pagoda, Prado (en, hy) →
`prado-museum`, Chapultepec → `chapultepec-castle`, de Met
`das-metropolitan-…` → `metropolitan-museum-of-art`, ru GEM `gem` →
`bolshoy-egipetskiy-muzey-gem`, Balıklıgöl `sanliurfa/` → `şanlıurfa/` (11
languages), plus Istiklal (6), Balat (6), da Basilica Cistern, nb
Hippodrome. Full list: `merges.json` in the Audioguide folder's `cm/`.

94 pages that had no English sibling in their hreflang group (61 Turkish, the
Ortaköy/Göreme translations, the Istanbul Archaeology Museums set, etc.) were
joined to their English page by adding one `hreflang="en"` link and re-running
link-langs. List: `joins.json`.

Hub cards still list both versions of a merged pair (the alias card links to a
page that canonicalises to the keeper). Removing them means fixing counts in
45 languages — do it with a hub rebuild, not by hand.

**Georgian coordinates.** Most Tbilisi, Kutaisi, Mtskheta and Mestia pages
carried placeholder coordinates 2–100 km off. 36 attractions (70 pages in all
languages) now use Wikipedia / OpenStreetMap / Google Places coordinates
(`coordfix.py`), and every "nearby" distance on those cities' pages was
recomputed and re-sorted. 9 pages still have no sourced coordinate
(Leselidze Street, Mtkvari Waterfront, Shardeni Street Market, both Gino
pages, Metekhi Palace, Metekhi Square, the funicular page, Batumi Piazza):
their own pages keep the placeholder, and other pages' rails show them
without a distance.

## Content-factory wave 1 (EN, 2026-10-30)

1,367 new English attraction pages from the content factory (`target_guides` with
Wikipedia ≥3k views/month, guides already cached — no generation was paid for),
plus 51 new city hubs, 17 new country hubs, 63 rebuilt city hubs and 61 rebuilt
country hubs.

Pipeline (data lives outside the repo, in the wave's FACTORY_DATA folder):
1. `items.json` — one record per guide: the cached_guides payload (title, script,
   key_facts, look_for, tips, duration) + Wikidata (coordinates, description,
   country ISO, enwiki, official site) + Commons photo with author and licence.
   Curation before that step dropped 143 guides (not visitable, objects shown
   elsewhere, ancient-city concepts, destroyed, duplicates within the wave), 12
   duplicates of existing pages, and held 29 in disputed territory (Jerusalem,
   West Bank, Crimea) pending a labelling decision.
2. `gen_factory_en.py <stage>` — the pages. Lead = Wikidata description + first
   key fact + guide length; JSON-LD TouristAttraction with geo, address,
   additionalType and `sameAs` (Wikipedia, Wikidata, official site); FAQ only
   from the guide's own facts/tips/look-for; hero photo credited under the
   image; "Nearby" rail from new + existing EN pages within 50 km. No
   "time needed" row (the factory has no visit time) and no
   `isAccessibleForFree` claim about the place itself.
   City: an existing hub when the factory city matches it (or the place is
   within 4 km of it), otherwise the factory city — "near <city>" in the text
   when the page has no hub, because the factory city is the nearest town.
3. `gen_factory_hubs.py <public/explore> <stage>` — hubs. A hub that existed
   before the wave keeps its hreflang block, language menu, hero photo,
   "Planning your time" section and its old cards verbatim; wave cards are
   rebuilt from `items.json` on every run, and every indexable pre-wave page in the
   city folder gets a card (several old hubs had stopped listing newer pages).
   A hub with 3+ guides is indexable; one that was already indexable stays so.
   Country hubs list city hubs plus a "More places" list for pages with no
   city hub, so every page has at least one hub link.
4. link-langs → sitemap (8,027 URLs) + llms.txt; `build-explore-canonical.py`
   for the app's /attraction canonical; index.html A–Z + search-index.json.

Also in this pass: "45 languages" → "50+" on every EN facts table and hub stat
(2,595 files incl. twins) and the Hindi facts rows (267 files).
