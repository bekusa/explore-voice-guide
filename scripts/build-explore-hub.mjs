/**
 * build-explore-hub.mjs — Lokali SEO structure fix, 2026-08-27
 *
 *   node scripts/build-explore-hub.mjs            # dry run
 *   node scripts/build-explore-hub.mjs --apply    # write files
 *
 * WHY
 * Google Search Console reports 500 pages as "Discovered - currently not
 * indexed". The cause is that the explore pages are orphans: lokali.travel has
 * 75 links and none point into /explore/. Google only knows these pages from
 * the sitemap, which is a suggestion, not a crawl path. On top of that the
 * middle layer of the hierarchy is missing — 190 cities have attraction pages
 * but only istanbul, rome and tbilisi have a city page. Everything else 404s,
 * including /explore/ itself.
 *
 * WHAT THIS WRITES
 *   public/explore/index.html          hub linking every city
 *   public/explore/en/<city>.html      one per city that does not have one
 *   public/sitemap-explore.xml         same file plus the new urls
 *
 * It reads the real directory tree, so it stays correct as content changes.
 * Re-run it after every content regeneration.
 *
 * STILL NEEDS A HUMAN: add a footer link to /explore/ in the app shell.
 * Without an inbound link the hub is itself an orphan and this only half works.
 */

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const BASE = "https://lokali.travel";
const ROOT = process.cwd();
const PUB = path.join(ROOT, "public");
const EN = path.join(PUB, "explore", "en");
const APPLY = process.argv.includes("--apply");

if (!existsSync(EN)) {
  console.error(`! ${EN} not found. Run this from the repo root.`);
  process.exit(1);
}

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const SMALL = new Set(["and", "of", "the", "at", "in", "de", "del", "dos", "la", "le", "du"]);
const titleCase = (slug) =>
  slug
    .split("-")
    .map((w, i) => (i && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");

/** Pull the display name out of an attraction page rather than guessing it. */
async function nameFromPage(file, slug) {
  try {
    const html = await readFile(file, "utf8");
    const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
    if (h1) return h1[1].trim();
    const t = html.match(/<title>([^<,—|]+)/);
    if (t) return t[1].trim();
  } catch {}
  return titleCase(slug);
}

/** city slug -> [{slug, name}] */
async function scanCities() {
  const out = new Map();
  for (const entry of await readdir(EN, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const city = entry.name;
    const dir = path.join(EN, city);
    const attrs = [];
    for (const f of await readdir(dir)) {
      if (!f.endsWith(".html")) continue;
      const slug = f.replace(/\.html$/, "");
      attrs.push({ slug, name: await nameFromPage(path.join(dir, f), slug) });
    }
    if (attrs.length) {
      attrs.sort((a, b) => a.name.localeCompare(b.name));
      out.set(city, attrs);
    }
  }
  return out;
}

const CSS = `:root{--bg:#110c08;--fg:#f9f4ec;--muted:#a99c8e;--border:#352c25;--gold:#f5b75b;--card:#1b1510;--body:#e7ddcf}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--fg);font-family:'Inter',ui-sans-serif,system-ui,sans-serif;line-height:1.65;-webkit-font-smoothing:antialiased}
.page{max-width:860px;margin:0 auto;padding:0 20px 100px}
a{color:var(--gold)}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:18px 0 14px}
.brand{font-family:'Playfair Display',ui-serif,Georgia,serif;font-size:21px;font-weight:600;color:var(--fg);text-decoration:none}
.crumbs{font-size:12px;color:var(--muted);margin:2px 0 12px}
.crumbs a{color:var(--muted);text-decoration:none}
h1{font-family:'Playfair Display',ui-serif,Georgia,serif;font-weight:500;font-size:36px;line-height:1.08;margin-top:16px}
.lede{font-size:15px;color:var(--muted);margin-top:12px;max-width:56ch}
.cta-row{display:flex;gap:10px;margin-top:18px;max-width:360px}
.cta{flex:1;display:flex;align-items:center;justify-content:center;gap:10px;background:linear-gradient(135deg,#fdc357,#f67f2f);color:#110c08;border-radius:16px;padding:12px 18px;text-decoration:none;box-shadow:0 0 60px -16px #f5b75b8c}
.cta .lbl{display:flex;flex-direction:column;line-height:1.1}
.cta .lbl small{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;opacity:.75}
.cta .lbl b{font-size:16px;font-weight:700}
.sec{font-family:'Playfair Display',ui-serif,Georgia,serif;font-weight:500;font-size:22px;color:var(--gold);margin:30px 0 10px;border-bottom:1px solid var(--border);padding-bottom:6px}
.more-list{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.more-list a{display:inline-flex;align-items:center;background:var(--card);border:1px solid var(--border);border-radius:999px;padding:8px 14px;font-size:13px;color:var(--body);text-decoration:none}
.more-list a:hover{border-color:var(--gold);color:var(--gold)}
footer{border-top:1px solid var(--border);margin-top:38px;padding-top:20px;color:var(--muted);font-size:12.5px;text-align:center;line-height:1.85}
footer a{color:var(--gold);text-decoration:none}`;

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,500;0,600;1,500&display=swap" rel="stylesheet">`;

const FOOTER = `<footer>Lokali — free AI audio guides for travellers, in your own language.<br><a href="${BASE}/">Open the Lokali app</a></footer>`;

function cityPage(city, attrs) {
  const name = titleCase(city);
  const url = `${BASE}/explore/en/${city}.html`;
  const top = attrs.slice(0, 3).map((a) => a.name).join(", ");
  const desc = `Free ${name} audio guide in your own language: ${top}. History, tips and what to see — self-guided, no fee.`;
  const links = attrs
    .map((a) => `<a href="${BASE}/explore/en/${city}/${a.slug}.html">${esc(a.name)}</a>`)
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#110c08">
<title>${esc(name)} — Free Audio Guide &amp; Self-Guided Tour | Lokali</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="en-US" href="${url}">
<link rel="alternate" hreflang="en-GB" href="${url}">
<link rel="alternate" hreflang="x-default" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Lokali">
<meta property="og:locale" content="en">
<meta property="og:title" content="${esc(name)} — Free Audio Guide &amp; Self-Guided Tour | Lokali">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary_large_image">
${FONTS}
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": ${JSON.stringify(name + " audio guide")},
  "url": ${JSON.stringify(url)},
  "isPartOf": { "@type": "WebSite", "name": "Lokali", "url": "${BASE}/" },
  "breadcrumb": {
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Lokali", "item": "${BASE}/" },
      { "@type": "ListItem", "position": 2, "name": "Explore", "item": "${BASE}/explore/" },
      { "@type": "ListItem", "position": 3, "name": ${JSON.stringify(name)}, "item": ${JSON.stringify(url)} }
    ]
  }
}
</script>
<style>
${CSS}
</style>
</head>
<body>
<div class="page">
<header class="topbar"><a class="brand" href="${BASE}/">Lokali</a></header>
<div class="crumbs"><a href="${BASE}/">Lokali</a> › <a href="${BASE}/explore/">Explore</a> › ${esc(name)}</div>
<h1>${esc(name)}</h1>
<p class="lede">${attrs.length} landmark${attrs.length === 1 ? "" : "s"} in ${esc(name)} with a free Lokali audio guide. Pick one to read about it, then listen in the app in any of 47 languages.</p>
<div class="cta-row"><a class="cta" href="${BASE}/"><span class="lbl"><small>Begin</small><b>Open the Lokali app</b></span></a></div>
<section><h2 class="sec">What to see in ${esc(name)}</h2>
<div class="more-list">
${links}
</div></section>
${FOOTER}
</div>
</body>
</html>
`;
}

function hubPage(cities) {
  const names = [...cities.keys()].sort((a, b) => titleCase(a).localeCompare(titleCase(b)));
  const attrTotal = [...cities.values()].reduce((n, a) => n + a.length, 0);
  const groups = new Map();
  for (const c of names) {
    const letter = titleCase(c).charAt(0).toUpperCase();
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push(c);
  }
  const body = [...groups.entries()]
    .map(([letter, list]) => {
      const links = list
        .map((c) => `<a href="${BASE}/explore/en/${c}.html">${esc(titleCase(c))}</a>`)
        .join("\n");
      return `<section><h2 class="sec">${letter}</h2>\n<div class="more-list">\n${links}\n</div></section>`;
    })
    .join("\n\n");
  const desc = `Free self-guided audio tours for ${names.length} cities worldwide. Browse landmarks by city and listen in your own language — no ticket, no tour group, no fee.`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#110c08">
<title>Explore ${names.length} Cities — Free Audio Guides | Lokali</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${BASE}/explore/">
<link rel="alternate" hreflang="en-US" href="${BASE}/explore/">
<link rel="alternate" hreflang="en-GB" href="${BASE}/explore/">
<link rel="alternate" hreflang="x-default" href="${BASE}/explore/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Lokali">
<meta property="og:title" content="Explore ${names.length} Cities — Free Audio Guides | Lokali">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${BASE}/explore/">
<meta name="twitter:card" content="summary_large_image">
${FONTS}
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": "Explore cities with Lokali",
  "url": "${BASE}/explore/",
  "isPartOf": { "@type": "WebSite", "name": "Lokali", "url": "${BASE}/" }
}
</script>
<style>
${CSS}
</style>
</head>
<body>
<div class="page">
<header class="topbar"><a class="brand" href="${BASE}/">Lokali</a></header>
<div class="crumbs"><a href="${BASE}/">Lokali</a> › Explore</div>
<h1>Explore by city</h1>
<p class="lede">Free audio guides for ${names.length} cities and ${attrTotal} landmarks. Pick a city to see what is worth your time there, then listen in the Lokali app in any of 47 languages. No ticket, no tour group, no fee.</p>
<div class="cta-row"><a class="cta" href="${BASE}/"><span class="lbl"><small>Begin</small><b>Open the Lokali app</b></span></a></div>

${body}

${FOOTER}
</div>
</body>
</html>
`;
}

async function updateSitemap(newUrls) {
  const p = path.join(PUB, "sitemap-explore.xml");
  const xml = await readFile(p, "utf8");
  const have = new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  const add = newUrls.filter((u) => !have.has(u));
  if (!add.length) return { added: 0, total: have.size };
  const today = new Date().toISOString().slice(0, 10);
  const block = add
    .map(
      (u) =>
        `  <url>\n    <loc>${u}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n  </url>`
    )
    .join("\n");
  const out = xml.replace(/<\/urlset>\s*$/, `${block}\n</urlset>\n`);
  if (APPLY) await writeFile(p, out, "utf8");
  return { added: add.length, total: have.size + add.length };
}

// ------------------------------------------------------------------ run

console.log(`=== Lokali explore hub (${APPLY ? "APPLY" : "DRY RUN"}) ===\n`);

const cities = await scanCities();
console.log(`Scanned public/explore/en — ${cities.size} cities, ` +
  `${[...cities.values()].reduce((n, a) => n + a.length, 0)} attraction pages\n`);

let written = 0;
const newUrls = [`${BASE}/explore/`];
for (const [city, attrs] of cities) {
  const out = path.join(EN, `${city}.html`);
  newUrls.push(`${BASE}/explore/en/${city}.html`);
  if (existsSync(out)) continue;          // never overwrite a hand-built page
  if (APPLY) await writeFile(out, cityPage(city, attrs), "utf8");
  written++;
}
console.log(`1. City pages: ${written} created, ${cities.size - written} already existed`);

const hub = path.join(PUB, "explore", "index.html");
if (APPLY) await writeFile(hub, hubPage(cities), "utf8");
console.log(`2. Hub: public/explore/index.html (${cities.size} cities linked)`);

const sm = await updateSitemap(newUrls);
console.log(`3. Sitemap: +${sm.added} urls -> ${sm.total} total`);

console.log(`\n=== done ===`);
if (!APPLY) {
  console.log("Nothing was written. Re-run with --apply.");
} else {
  console.log("Next, by hand: add a footer link to /explore/ in the app shell.");
  console.log("Then in Search Console: Sitemaps -> resubmit, and validate the 404 fix.");
}
