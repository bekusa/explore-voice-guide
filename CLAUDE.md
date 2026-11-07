# explore-voice-guide — Lokali (lokali.travel)

Free AI audio-guide app (Android + iOS, Capacitor shells loading https://lokali.travel). Vite + React + TanStack Router SPA on Cloudflare Workers, synced with Lovable. Deploy is **Lovable → Publish**, never a bare git push (no GitHub Actions workflow).

- `public/explore/` — generated static SEO pages (44 language folders). **Never hand-edit**: change the generators in `scripts/` (gen_factory_en.py, gen_factory_hubs.py, build-explore-hub.mjs …) and regenerate, as its own commit. Read `scripts/README-lang-pages.md` and `scripts/README-explore-design.md` first.
- `public/blog.html`, `public/blog/` — Lokali Journal (static). Cloudflare Workers has no directory index: `/blog` → `/blog.html` via `public/_redirects`.
- `public/robots.txt`, `public/sitemap*.xml`, `public/llms.txt`, `public/_redirects`, `public/a7f3c91e5b2d48069c1fa73e8d2b5064.txt` (IndexNow key — never rename or delete), `public/google0a6f7b8c7fef3271.html` (Search Console verification).
- `tools/content-factory/` — bulk guide/attraction generation on the Max subscription (`claude -p`), with its own README.
- `tools/seo-agent/` — the standing SEO/GEO agent (`README.md`, `AGENT.md`, `RULES.md`). Its rules apply to every session in this repo through the hooks in `.claude/settings.json`; the agent-only rules (paid endpoints, app-table deletes, ad-hoc deploys) apply only while `tools/seo-agent/.active` exists. Start a run with the `seo-agent-run` skill.
- Secrets live in Lovable Project Secrets or environment secrets. The root `.env` is never read, printed or committed.
- Paid endpoints on the live site: `/api/guide`, `/api/attractions`, `/api/museum-highlights` (Claude generation on a miss), `/api/photo` (Google Places fallback), `/api/place-details` (Google). Do not call them in bulk; one unapproved bulk run cost about $1,500 in 2026.
- Content policy: Abkhazia and the Tskhinvali region (South Ossetia) are part of Georgia; other conflict zones get historic and cultural monuments only; no prices or opening hours in any content.
- On Beka's computer (mounted folders): no git commands, no deletes (move to `_to_delete/`), no detached processes.
