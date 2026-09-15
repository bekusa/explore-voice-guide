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
function Index() {
  return <HomeScreen />;
}
