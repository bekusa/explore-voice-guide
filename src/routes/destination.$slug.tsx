import { createFileRoute, notFound } from "@tanstack/react-router";
import { MobileFrame } from "@/components/MobileFrame";
import { DestinationScreen } from "@/components/DestinationScreen";
import { getDestination } from "@/lib/destinations";

export const Route = createFileRoute("/destination/$slug")({
  loader: ({ params }) => {
    const dest = getDestination(params.slug);
    if (!dest) throw notFound();
    return { dest };
  },
  head: ({ loaderData }) =>
    loaderData
      ? {
          meta: [
            { title: `${loaderData.dest.city}, ${loaderData.dest.country} — Voices Audio Guides` },
            {
              name: "description",
              content: loaderData.dest.blurb,
            },
            { property: "og:title", content: `Voices of ${loaderData.dest.city}` },
            { property: "og:description", content: loaderData.dest.blurb },
            { property: "og:image", content: loaderData.dest.hero },
            { property: "twitter:image", content: loaderData.dest.hero },
          ],
        }
      : { meta: [{ title: "Destination — Voices" }] },
  errorComponent: ({ error }) => (
    <div className="grid min-h-screen place-items-center bg-background p-6 text-center text-foreground">
      <div>
        <h1 className="text-2xl font-medium">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="grid min-h-screen place-items-center bg-background p-6 text-center text-foreground">
      <div>
        <h1 className="text-2xl font-medium">Destination not found</h1>
        <a href="/destinations" className="mt-3 inline-block text-primary underline">
          Browse all destinations
        </a>
      </div>
    </div>
  ),
  component: DestinationPage,
});

function DestinationPage() {
  const { dest } = Route.useLoaderData();
  return (
    <MobileFrame>
      <DestinationScreen dest={dest} />
    </MobileFrame>
  );
}
