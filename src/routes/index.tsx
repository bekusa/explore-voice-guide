import { createFileRoute } from "@tanstack/react-router";
import { HomeScreen } from "@/components/HomeScreen";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lokali — Cinematic Audio Guides for Cities Around the World" },
      {
        name: "description",
        content:
          "Locally narrated, cinematic walking tours for cities across the globe — from Tbilisi to Paris, Rome to London. Listen anywhere, even offline.",
      },
      { property: "og:title", content: "Lokali — Audio Guides for Travellers" },
      {
        property: "og:description",
        content: "Cinematic walking tours, narrated by locals, for cities around the world.",
      },
    ],
  }),
  component: Index,
});

// MobileFrame moved INSIDE HomeScreen so the home page can pass its
// own floatingPanel (the hero Listen audio player). The outer route
// is now a thin shell — head metadata + the component.
function Index() {
  return <HomeScreen />;
}
