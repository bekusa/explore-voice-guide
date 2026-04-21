import { createFileRoute } from "@tanstack/react-router";
import { MobileFrame } from "@/components/MobileFrame";
import { HomeScreen } from "@/components/HomeScreen";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Whispers of Old Tbilisi — Cinematic Audio Guides" },
      {
        name: "description",
        content: "A cinematic, locally-narrated audio guide through Old Tbilisi — sulfur baths, sacred chants, and hidden courtyards.",
      },
      { property: "og:title", content: "Whispers of Old Tbilisi" },
      { property: "og:description", content: "Cinematic audio tours of Tbilisi's old town." },
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
