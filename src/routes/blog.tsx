import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * /blog -> /blog.html
 *
 * The journal is a set of static files in `public/` (`blog.html` plus
 * `blog/<slug>.html`), because they have to be server-rendered HTML — the
 * AI answer engines that read this site do not execute JavaScript.
 *
 * `public/_redirects` already contains a rule for this, but **that file does
 * nothing on this deploy**: `_redirects` is a Cloudflare *Pages* feature and
 * this app ships as a Cloudflare *Worker* (`wrangler.jsonc` -> `main:
 * @tanstack/react-start/server-entry`). Nothing reads it. Verified live:
 * `/blog` 404s, and so does every rule in that file, including the ~170
 * city-correction redirects under /explore/.
 *
 * So the redirect has to live in the router. `/blog/` is normalised to
 * `/blog` by the router itself (307), which then lands here.
 *
 * 301, because this is permanent and we want the link equity on blog.html.
 */
export const Route = createFileRoute("/blog")({
  beforeLoad: () => {
    throw redirect({ href: "/blog.html", statusCode: 301 });
  },
});
