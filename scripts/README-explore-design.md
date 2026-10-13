# /explore/ design system (lk-design)

Every /explore/ page uses the Lokali app look: shared stylesheet `public/explore/assets/lk-1.css`,
a full-width photo hero, photo cards, an app panel and the "Get the app" button on every page.

Files:
- `lk_sys.py`: tokens, CSS and card/topbar helpers
- `lk_l10n.py`: app-panel copy in 47 languages
- `lk_restyle.py`: re-skins any existing page (attraction, city hub, country; all templates and languages)
- `lk_index.py`: builds `public/explore/index.html` (search, theme rails, cities)

**Run order after any generator (gen.py, link-langs.py, a new language):**
1. Generate pages as before.
2. Run `lk_restyle.py` over the new or changed files. Pages that already carry
   `<meta name="lk-design">` are skipped, so it's safe to run over everything.
3. Rebuild the index with `lk_index.py <public> <public>/explore/index.html`.

The restyler keeps the head, hreflang, canonical and JSON-LD byte-for-byte. It refuses to write
if the counts of alternates, ld+json or canonical change. It never invents text; non-English pages
reuse their own localized CTA, headings and footer.
