import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Star, Clock, MapPin, Share2, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n";
import { getAttraction, type Attraction } from "@/lib/mockApi";
import { CardSkeleton } from "@/components/CardSkeleton";

export const Route = createFileRoute("/attraction/$id")({
  loader: async ({ params }) => {
    const attr = await getAttraction(params.id);
    if (!attr) throw notFound();
    return attr;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.name} — Lokali` },
          { name: "description", content: loaderData.description },
          { property: "og:title", content: loaderData.name },
          { property: "og:description", content: loaderData.description },
          { property: "og:image", content: loaderData.image },
        ]
      : [],
  }),
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-8 text-center">
        <p className="text-destructive">{error.message}</p>
        <button onClick={() => { router.invalidate(); reset(); }} className="mt-4 rounded-full bg-primary px-6 py-2 text-sm text-primary-foreground">
          Retry
        </button>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="p-8 text-center">
      <p className="text-muted-foreground">Attraction not found.</p>
      <Link to="/" className="mt-4 inline-block text-primary underline">Go home</Link>
    </div>
  ),
  pendingComponent: () => (
    <div className="space-y-4 p-5 pt-safe">
      <CardSkeleton />
      <div className="shimmer h-6 w-2/3 rounded" />
      <div className="shimmer h-4 w-full rounded" />
    </div>
  ),
  component: AttractionPage,
});

function AttractionPage() {
  const attr = Route.useLoaderData() as Attraction;
  const { t } = useT();
  const [scrollY, setScrollY] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div ref={ref} className="animate-slide-in">
      {/* Parallax hero */}
      <div className="relative h-[55vh] min-h-[360px] overflow-hidden">
        <img
          src={attr.image}
          alt={attr.name}
          width={1024}
          height={1024}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ transform: `translateY(${scrollY * 0.35}px) scale(${1 + scrollY * 0.0005})` }}
        />
        <div className="absolute inset-0 bg-gradient-hero" />

        {/* Top controls */}
        <div className="relative z-10 flex items-center justify-between px-5 pt-safe">
          <Link
            to="/"
            className="mt-3 grid h-10 w-10 place-items-center rounded-full bg-card/90 text-foreground shadow-soft backdrop-blur"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <button
            className="mt-3 grid h-10 w-10 place-items-center rounded-full bg-card/90 text-foreground shadow-soft backdrop-blur"
            aria-label="Share"
          >
            <Share2 className="h-4 w-4" />
          </button>
        </div>

        {/* Bottom title overlay */}
        <div className="absolute inset-x-0 bottom-0 z-10 px-5 pb-6 text-card">
          <p className="text-xs font-medium uppercase tracking-wider text-card/80">{attr.country}</p>
          <h1 className="mt-1 font-display text-4xl leading-tight text-card">{attr.name}</h1>
          <div className="mt-2 flex items-center gap-3 text-xs text-card/90">
            <span className="inline-flex items-center gap-1">
              <Star className="h-3 w-3 fill-card text-card" />
              {attr.rating.toFixed(2)}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {attr.city}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {attr.durationMin} min
            </span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="relative -mt-6 rounded-t-3xl bg-background px-5 pb-32 pt-6 shadow-elevated">
        <div className="grid grid-cols-3 gap-3">
          <Stat label={t("rating")} value={attr.rating.toFixed(1)} />
          <Stat label={t("duration")} value={`${attr.durationMin}m`} />
          <Stat label={t("stops")} value={String(attr.stops)} />
        </div>

        <p className="mt-6 text-[15px] leading-relaxed text-foreground">{attr.description}</p>

        <div className="mt-6 rounded-2xl border border-border bg-card p-4 shadow-soft">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{t("hours")}</p>
          <p className="mt-1 text-sm font-medium text-foreground">{attr.hours}</p>
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {t("openNow")}
          </p>
        </div>

        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-foreground">{t("script")}</h2>
          <p className="text-sm text-muted-foreground">{attr.scriptParagraphs[0]}</p>
        </div>
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-1/2 z-30 w-full max-w-[480px] -translate-x-1/2 border-t border-border bg-card/95 px-5 py-3 backdrop-blur pb-safe">
        <Link
          to="/player/$id"
          params={{ id: attr.id }}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground shadow-card transition-colors hover:bg-primary/90"
        >
          <Sparkles className="h-4 w-4" />
          {t("generateGuide")}
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-secondary/60 p-3 text-center">
      <p className="font-display text-xl text-foreground">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
