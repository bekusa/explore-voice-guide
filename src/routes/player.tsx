/**
 * Back-compat redirect. The standalone /player page was retired in
 * favour of an inline audio panel on the attraction page (per Beka's
 * "ცალკე ფეიჯი არ მინდა" feedback — we shouldn't teleport users away
 * from the place they were reading about). Anyone still landing on
 * /player?name=X — old bookmarks, shared links, search-engine results
 * — gets bounced to /attraction/<slug>?name=X so the journey
 * continues there.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { attractionSlug } from "@/lib/api";

type Search = { name?: string };

export const Route = createFileRoute("/player")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    name: typeof search.name === "string" ? search.name : undefined,
  }),
  beforeLoad: ({ search }) => {
    const name = search.name?.trim();
    if (!name) {
      throw redirect({ to: "/" });
    }
    throw redirect({
      to: "/attraction/$id",
      params: { id: attractionSlug(name) },
      search: { name },
    });
  },
  component: () => null,
});
