import { createFileRoute } from "@tanstack/react-router";
import { MobileFrame } from "@/components/MobileFrame";
import { HomeScreen } from "@/components/HomeScreen";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Whispers — Cinematic Audio Guides for Travelers Worldwide" },
      {
        name: "description",
        content: "Locally-narrated, cinematic audio tours of the world's most iconic destinations — from Santorini to Kyoto to Marrakech. A premium voice guide for travelers.",
      },
      { property: "og:title", content: "Whispers — Audio Guides Worldwide" },
      { property: "og:description", content: "Cinematic, locally-narrated audio tours of iconic destinations around the world." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <MobileFrame>
      <HomeScreen />
    </MobileFrame>
  );
}
