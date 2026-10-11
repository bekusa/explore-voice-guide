# The Journal, and how Soro feeds it

## Why the Soro snippet is not the blog

Soro's own integration is this:

```html
<div id="soro-blog"></div>
<script src="https://app.trysoro.com/api/embed/<token>?theme=dark" defer></script>
```

That is **client-side JavaScript loaded from a third-party domain.** The
articles never exist in the HTML our server returns — they are fetched and
injected by the browser, and the widget does its own `pushState` routing.

Googlebot renders JavaScript, so Google would eventually see it. The AI answer
engines do not. Measurements (Vercel/MERJ, December 2024, still the most-cited
data as of 2026) show GPTBot, OAI-SearchBot, ClaudeBot and PerplexityBot fetch
JS files but never execute them: they index only the initial HTML. Of the
crawlers that matter here, only Googlebot, Bingbot and Applebot render.

`robots.txt` in this repo is written around those AI crawlers. Shipping the
blog as a JS widget would make it invisible to exactly the readers the
subscription was bought to reach.

So the widget is **not** the public blog. It lives on one noindex page and the
real pages are generated.

## The pipeline

```
Soro writes + publishes
   -> RSS feed   https://app.trysoro.com/api/rss/<token>
   -> scripts/soro-sync.py
   -> public/blog/<slug>.html     server-rendered, full <head> + schema
   -> public/blog.html            index cards + ItemList
   -> public/sitemap-blog.xml
   -> push, then IndexNow
```

The feed was switched on with `POST /api/rss/enable` on the Soro account
(it returns the same token as the embed snippet). Only **published** articles
appear in it — drafts and scheduled articles do not.

```bash
python3 scripts/soro-sync.py --dry-run   # print the plan, write nothing
python3 scripts/soro-sync.py             # render, update index + sitemap
```

Output pages use the same stylesheet and layout as the five hand-built journal
articles — the script lifts the `<style>` block out of
`self-guided-vs-guided-tours.html` rather than keeping a second copy of it.

## /blog/live.html

The Soro widget sits on `public/blog/live.html`, which is
`noindex,nofollow` and canonicalised to `/blog.html`. Its only job is to let
you see what Soro has published before it is promoted to a static page. It is
not linked from anywhere.

## Safety rails

- **It cannot overwrite a hand-built article.** The script owns only the slugs
  recorded in `public/blog/.soro-manifest.json`. A feed item whose slug
  collides with any other existing file is skipped and reported. This rail
  exists because the first version of the script did replace the 30 KB
  hand-written Rome itinerary with a 12 KB generated one.
- **Third-party HTML is sanitised through an allowlist** (`Sanitiser` in the
  script). `script`, `style`, `iframe`, `object`, `embed`, `form` and `svg` are
  dropped with their contents; `on*` handlers and `javascript:` URLs are
  stripped; external links get `rel="nofollow noopener"`; `h1` in the body is
  demoted to `h2`. Soro's content arrives on our domain, so nothing executable
  from it is allowed to.
- **Atomic writes** (temp file + `os.replace`) everywhere, same as the other
  build scripts.
- **Idempotent.** Running it twice changes nothing the second time.

## Kill switch

Two levels, both one command:

```bash
SORO_NOINDEX=1 python3 scripts/soro-sync.py
```

Every Soro page becomes `noindex,nofollow`, loses its hreflang, and drops out
of `blog.html` and `sitemap-blog.xml`. `/explore/` and the five hand-built
articles are untouched.

```bash
curl -X POST https://app.trysoro.com/api/rss/disable   # (needs the logged-in session)
```

Stops the feed, which also disables the embed.

## The thing to actually watch

Google's **scaled content abuse** policy targets mass-produced pages whose
main purpose is ranking. Autopilot publishing is exactly the shape that policy
describes. The site's defence is that `/explore/` is real guide text from the
database and the journal is hand-checked — so read what Soro publishes before
it accumulates. `/blog/live.html` and `--dry-run` exist for that.

Also note each generated page sets `datePublished` from the feed and carries
no `reviewedBy`: do not add "Verified <month>" badges to Soro pages the way
the hand-built articles have them, because nobody verified them.

## Known state

- Soro account: 2 sites (`lokali.travel` current, `kokto.app` main), $39/mo.
- As of 2026-10-11: 1 draft, 0 published, 13 scheduled. The feed is empty and
  `soro-sync.py` correctly writes nothing.
