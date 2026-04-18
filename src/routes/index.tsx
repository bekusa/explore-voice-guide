import { createFileRoute } from "@tanstack/react-router";
import { MobileFrame } from "@/components/MobileFrame";
import { HomeScreen } from "@/components/HomeScreen";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Whispers — Tbilisi Audio Guide for Travelers" },
      {
        name: "description",
        content: "Cinematic, locally-narrated audio tours of Tbilisi. Discover Narikala, Abanotubani sulfur baths, and hidden lanes with a premium voice guide.",
      },
      { property: "og:title", content: "Whispers — Tbilisi Audio Guide" },
      { property: "og:description", content: "A premium voice guide for travelers exploring Tbilisi." },
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
