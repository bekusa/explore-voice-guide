import { createFileRoute } from "@tanstack/react-router";
import { HomeScreen } from "@/components/HomeScreen";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lokali - Free Audio Guides in 45 Languages" },
      {
        name: "description",
        content:
          "Free audio guides for 190+ cities worldwide, in 45 languages. History, what to look for and practical tips - offline, no ticket, no tour group.",
      },
      { property: "og:title", content: "Lokali - Free Audio Guides in 45 Languages" },
      {
        property: "og:description",
        content: "Free audio guides for 190+ cities worldwide, in 45 languages. History, what to look for and practical tips - offline, no ticket, no tour group.",
      },
    ],
  }),
  component: Index,
});

// MobileFrame moved INSIDE HomeScreen so the home page can pass its
// own floatingPanel (the hero Listen audio player). The outer route
// is now a thin shell — head metadata + the component.
// Entity markup (2026-09-20, SEO/GEO strategy): tells search and AI engines
// which "Lokali" this is — several unrelated apps share the name.
// Rendered server-side in the body; Google reads JSON-LD anywhere.
const ORG_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://lokali.travel/#organization",
      "name": "Lokali",
      "alternateName": [
        "Lokali Audio Guide",
        "Lokali — Free Audio Guides"
      ],
      "url": "https://lokali.travel/",
      "logo": "https://lokali.travel/icon-512.png",
      "description": "Lokali makes free AI-narrated audio guides for landmarks and museums in 190+ cities, in 45 languages.",
      "email": "contact@lokali.travel",
      "sameAs": [
        "https://play.google.com/store/apps/details?id=app.lokali.travel",
        "https://www.facebook.com/profile.php?id=61594728502493",
        "https://www.instagram.com/lokali.travel"
      ]
    },
    {
      "@type": "WebSite",
      "@id": "https://lokali.travel/#website",
      "name": "Lokali",
      "url": "https://lokali.travel/",
      "publisher": {
        "@id": "https://lokali.travel/#organization"
      }
    },
    {
      "@type": "MobileApplication",
      "@id": "https://lokali.travel/#app",
      "name": "Lokali: AI Audio Tour & Guide",
      "operatingSystem": "Android",
      "applicationCategory": "TravelApplication",
      "url": "https://play.google.com/store/apps/details?id=app.lokali.travel",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD"
      },
      "publisher": {
        "@id": "https://lokali.travel/#organization"
      }
    }
  ]
};

function Index() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSON_LD) }}
      />
      <HomeScreen />
    </>
  );
}
