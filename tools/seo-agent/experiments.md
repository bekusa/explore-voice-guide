# experiments.md — Lokali SEO/GEO agent

Every new tag, parameter or technique goes here first: source → hypothesis → cohort (≤100 pages or 1 template) → metric → 4 weeks → result → roll out or drop. At most 3 new proposals a week. Nothing site-wide without a cohort test.

| id | date | source | hypothesis | cohort | metric | start | end | result | decision |
|---|---|---|---|---|---|---|---|---|---|
| X-001 | 2026-11-07 | Cloudflare content signals policy (Sept 2025); robots.txt `Content-Signal:` directive | Declaring `search=yes, ai-input=yes` (training per Q7) does not change indexing and may help AI engines classify intent | robots.txt (site-wide by nature; low risk) | AI impressions share (GSC Generative AI report), bot fetch counts | — | — | — | evaluate in ONBOARDING; decide with Q7 |
| X-002 | 2026-11-07 | IndexNow (key already in public/) | Submitting changed /explore/ URLs to IndexNow shortens Bing's time-to-index | the next 100 regenerated pages vs 100 not submitted | days until Bing indexes (Bing Webmaster URL inspection) | — | — | — | run after T-002 |
| X-003 | 2026-11-07 | schema.org AudioObject on pages with a playable audio URL | Audio markup increases rich-result eligibility and AI citations for "audio guide <place>" queries | 50 Tier-1 place pages with audio vs 50 without markup | impressions and CTR on category queries; Rich Results Test | — | — | — | needs a public audio URL per guide; check feasibility first |
| X-004 | 2026-11-07 | MobileApplication JSON-LD (applicationCategory TravelApplication) on entry pages | App entity markup improves brand SERP and AI entity recognition | homepage (static entry) + /about | brand-query impressions; AI panel mentions | — | — | — | part of T-009 |
| X-005 | 2026-11-07 | lastReviewed dates from qa_units on place pages | Visible, true "last reviewed" dates raise CTR and AI trust signals | 100 Tier-1 pages audited by the QA agent | CTR delta vs control | — | — | — | after the QA agent has audited enough units |
| X-006 | 2026-11-07 | image sitemap for hero photos | Image sitemap adds Google Images impressions for place queries | sitemap-images.xml for wave-1 pages | Image search impressions in GSC | — | — | — | low priority |
| X-007 | 2026-11-07 | category titles ("<Place> audio guide — free, in <language>") | Category-word titles lift category-query positions without hurting place-query CTR | 100 Tier-1 pages via template flag vs 100 control | positions on "<place> audio guide"; CTR on "<place>" | — | — | — | first template experiment after baseline |
