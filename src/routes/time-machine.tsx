import { createFileRoute } from "@tanstack/react-router";
import TimeMachine from "@/components/TimeMachine";

type Search = { id?: string };

export const Route = createFileRoute("/time-machine")({
  // ?id=<attraction_id> deep-links to a specific moment so the Home
  // strip cards can hand off to the right card on this page.
  validateSearch: (search: Record<string, unknown>): Search => ({
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Time Machine — Lokali" },
      {
        name: "description",
        content: "34 immersive historical simulations. Step inside the moment, become the witness.",
      },
      { property: "og:title", content: "Time Machine — Lokali" },
      {
        property: "og:description",
        content: "34 immersive historical simulations. Step inside the moment, become the witness.",
      },
    ],
    // Self-canonical (2026-11-10): ?id=… only picks the starting card, the
    // page is the same. Search Console listed /time-machine?id=first_contact,
    // ?id=alexandria_library, ?id=pompeii_day, ?id=rhodes_colossus as
    // "Duplicate without user-selected canonical" — this folds them into one.
    links: [{ rel: "canonical", href: "https://lokali.travel/time-machine" }],
  }),
  component: TimeMachinePage,
});

function TimeMachinePage() {
  const { id } = Route.useSearch();
  // No webhookUrl / onResult — TimeMachine navigates to /tm-sim/$id/$role
  // and the result page owns the fetch. The placeholder webhook URL
  // and console.log that used to live here were leftovers from the
  // pre-/tm-sim architecture; both removed in pre-Capacitor cleanup.
  return <TimeMachine language="English" initialId={id ?? null} />;
}
