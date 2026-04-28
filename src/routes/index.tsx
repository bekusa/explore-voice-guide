import { createFileRoute } from "@tanstack/react-router";
import { MobileFrame } from "@/components/MobileFrame";
import { HomeScreen } from "@/components/HomeScreen";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Whispers — Cinematic Audio Guides for Cities Around the World" },
      {
        name: "description",
        content:
          "Locally narrated, cinematic walking tours for cities across the globe — from Tbilisi to Kyoto, Rome to Marrakech. Listen anywhere, even offline.",
      },
      { property: "og:title", content: "Whispers — Audio Guides for Travellers" },
      {
        property: "og:description",
        content: "Cinematic walking tours, narrated by locals, for cities around the world.",
      },
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
