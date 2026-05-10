import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, MapPin } from "lucide-react";
import { MobileFrame } from "@/components/MobileFrame";
import { useT } from "@/hooks/useT";
import { useTranslated } from "@/hooks/useT";
import { MUSEUMS, type Museum } from "@/lib/topMuseums";
import { attractionSlug, fetchPlacePhoto } from "@/lib/api";

/**
 * /museums — full grid of all 20 curated museums.
 *
 * Mirrors the Time Machine page in spirit: we ship a hand-picked
 * editorial set rather than asking the LLM to roll a fresh "best
 * museums" list every time. Tapping a card opens the existing
 * /attraction/$id flow, which already knows how to fetch the rich
 * guide and (in Phase 2) the museum-specific highlights section.
 */
export const Route = createFileRoute("/museums")({
  head: () => ({
    meta: [
      { title: "Top Museums — Lokali" },
      {
        name: "description",
        content: "Twenty hand-picked museums that define human culture, narrated by Lokali AI.",
      },
      { property: "og:title", content: "Top Museums — Lokali" },
      {
        property: "og:description",
        content: "Twenty hand-picked museums that define human culture.",
      },
    ],
  }),
  component: MuseumsPage,
});

function MuseumsPage() {
  const t = useT();
  return (
    <MobileFrame>
      <div className="relative min-h-full bg-background pb-12 text-foreground">
        {/* Header — matches the /results trim: pt-7 clears notch, pb-3
            keeps the strip tight, back button h-9 */}
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 px-6 pt-7 pb-3 backdrop-blur-xl">
          <div className="flex items-center gap-2.5">
            <Link
              to="/"
              aria-label={t("nav.back")}
              className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card transition-smooth hover:bg-secondary"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-[18px] font-medium leading-tight text-foreground">
                {t("museums.title")}
              </h1>
              <p className="text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
                {t("museums.subtitle")}
              </p>
            </div>
          </div>
        </header>

        {/* Intro line */}
        <section className="px-6 pt-5">
          <p className="text-[13px] leading-relaxed text-foreground/80">{t("museums.intro")}</p>
        </section>

        {/* Grid — single column on mobile so the cards read like a
            curated zine rather than a thumbnail grid; aligns with the
            rest of the app's "one big card at a time" pattern. */}
        <section className="mt-6 flex flex-col gap-4 px-6">
          {MUSEUMS.map((m, i) => (
            <MuseumCard key={m.id} museum={m} rank={i + 1} />
          ))}
        </section>
      </div>
    </MobileFrame>
  );
}

function MuseumCard({ museum, rank }: { museum: Museum; rank: number }) {
  // Translate the free-form display fields on the fly. id, image stay
  // English (URL + slug stability), everything else flows through the
  // gateway like destination cards do.
  const [name, blurb, city, country] = useTranslated([
    museum.name,
    museum.blurb,
    museum.city,
    museum.country,
  ]);
  const t = useT();
  // The attraction page resolves its content by name. Sending the
  // English `name` ensures the photo lookup and guide fetch land on
  // the right place even when the user is browsing in Georgian.
  const slug = attractionSlug(museum.name);
  // Wikipedia-sourced photo via the artwork-scope path (Google
  // Places skipped). Falls back to the LoremFlickr seed until
  // Wikipedia returns. See the matching change on the home strip.
  const [photo, setPhoto] = useState<string | null>(museum.image);
  useEffect(() => {
    let cancelled = false;
    fetchPlacePhoto(museum.name, "en", museum.city, "artwork").then((url) => {
      if (!cancelled && url) setPhoto(url);
    });
    return () => {
      cancelled = true;
    };
  }, [museum.name, museum.city]);
  return (
    <Link
      to="/attraction/$id"
      params={{ id: slug }}
      search={{ name: museum.name }}
      className="group relative h-[200px] overflow-hidden rounded-2xl border border-border bg-card transition-smooth hover:border-primary/50 active:scale-[0.98]"
    >
      <img
        src={photo ?? museum.image}
        alt={name}
        loading="lazy"
        onError={() => setPhoto(museum.image)}
        className="absolute inset-0 h-full w-full object-cover transition-smooth group-hover:scale-[1.04]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/10" />

      {/* Rank pill — same visual language as Time Machine cards so the
          two strips read as siblings on the home page. */}
      <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-primary/50 bg-background/55 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-primary backdrop-blur-md">
        #{rank}
      </div>

      {/* Beka asked to drop the decorative emoji from museum cards. */}
      <div className="absolute inset-x-4 bottom-3.5">
        <h3 className="font-display text-[18px] font-medium leading-tight text-foreground line-clamp-2">
          {name}
        </h3>
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-[10.5px] text-foreground/70">
          <MapPin className="h-2.5 w-2.5" /> {city}, {country}
        </p>
        <p className="mt-2 text-[12.5px] leading-snug text-foreground/85 line-clamp-2">{blurb}</p>
        <p className="mt-2 inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.18em] text-primary">
          {t("museums.openGuide")} <ArrowRight className="h-3 w-3" />
        </p>
      </div>
    </Link>
  );
}
