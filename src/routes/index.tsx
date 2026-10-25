import { createFileRoute } from "@tanstack/react-router";
import { HomeScreen } from "@/components/HomeScreen";
import { LANGUAGE_COUNT_LABEL } from "@/lib/languages";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `Lokali - Free Audio Guides in ${LANGUAGE_COUNT_LABEL} Languages` },
      {
        name: "description",
        content: `Free audio guides for 190+ cities worldwide, in ${LANGUAGE_COUNT_LABEL} languages. History, what to look for and practical tips - offline, no ticket, no tour group.`,
      },
      {
        property: "og:title",
        content: `Lokali - Free Audio Guides in ${LANGUAGE_COUNT_LABEL} Languages`,
      },
      {
        property: "og:description",
        content: `Free audio guides for 190+ cities worldwide, in ${LANGUAGE_COUNT_LABEL} languages. History, what to look for and practical tips - offline, no ticket, no tour group.`,
      },
    ],
    /* Entity markup belongs HERE, in the head, not in the component
     * tree. Beka 2026-10-25 — moving it is what fixed React #418 on
     * this page; the whole story is in the comment above ORG_JSON_LD. */
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(ORG_JSON_LD),
      },
    ],
  }),
  component: Index,
});

// MobileFrame lives INSIDE HomeScreen (it originally moved there so
// the home page could pass its own audio-player slot; the player is
// global now, but HomeScreen still owns the frame). The outer route
// is a thin shell — head metadata + the component.
/* Entity markup (2026-09-20, SEO/GEO strategy): tells search and AI
 * engines which "Lokali" this is — several unrelated apps share the
 * name.
 *
 * ── Why this is in head(), not in the component ──────────────────
 * Beka 2026-10-25. This used to render as
 *     <script type="application/ld+json" dangerouslySetInnerHTML=… />
 * inside Index(), as a sibling of <HomeScreen/>. That one line was
 * the cause of React error #418 on the homepage, and the dev build's
 * diff named it outright: React expected its own ld+json script at
 * that position and instead found PostHog's injected
 * `eu-assets.i.posthog.com/array/…` script, with the ld+json shifted
 * one node down.
 *
 * The PostHog loader inserts its <script> before the first existing
 * script in the document. Because this route rendered a <script>
 * INSIDE the hydrated tree, PostHog's insertion landed inside that
 * tree and shifted every following node by one, so hydration could
 * not line up.
 *
 * That also explains the detail that made no sense for a day: the
 * error only appeared for non-English users. Language has nothing to
 * do with it — a non-English session loads an extra locale chunk and
 * runs extra translate calls, which delays hydration just enough for
 * PostHog's script to land first. It is a RACE, and English merely
 * usually won it. Anything that slows a page down could lose it.
 *
 * Declaring it here puts the tag in <head> via <HeadContent/>, far
 * away from the hydrated body and from PostHog's insertion point.
 * Google reads JSON-LD in the head perfectly well — in fact that is
 * the conventional place for it.
 *
 * Rule of thumb this leaves behind: do not render <script> elements
 * inside the React tree in this app. Use the route's head().
 */
const ORG_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://lokali.travel/#organization",
      name: "Lokali",
      alternateName: ["Lokali Audio Guide", "Lokali — Free Audio Guides"],
      url: "https://lokali.travel/",
      logo: "https://lokali.travel/icon-512.png",
      description: `Lokali makes free AI-narrated audio guides for landmarks and museums in 190+ cities, in ${LANGUAGE_COUNT_LABEL} languages.`,
      email: "contact@lokali.travel",
      sameAs: [
        "https://play.google.com/store/apps/details?id=app.lokali.travel",
        "https://www.facebook.com/profile.php?id=61594728502493",
        "https://www.instagram.com/lokali.travel",
      ],
    },
    {
      "@type": "WebSite",
      "@id": "https://lokali.travel/#website",
      name: "Lokali",
      url: "https://lokali.travel/",
      publisher: {
        "@id": "https://lokali.travel/#organization",
      },
    },
    {
      "@type": "MobileApplication",
      "@id": "https://lokali.travel/#app",
      name: "Lokali: AI Audio Tour & Guide",
      operatingSystem: "Android",
      applicationCategory: "TravelApplication",
      url: "https://play.google.com/store/apps/details?id=app.lokali.travel",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      publisher: {
        "@id": "https://lokali.travel/#organization",
      },
    },
  ],
};

function Index() {
  // Nothing but the screen. The JSON-LD that used to sit here is
  // declared in head() above — see the note on ORG_JSON_LD.
  return <HomeScreen />;
}
