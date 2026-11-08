import { Check, Loader2, Plus, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useT } from "@/hooks/useT";
import { usePreferredLanguage } from "@/hooks/usePreferredLanguage";
import { haptic } from "@/lib/haptics";
import {
  attractionSlug,
  classifySearchQuery,
  detectQueryLanguage,
  fetchAttractionsWithMeta,
} from "@/lib/api";
import { addPlaceToTrip } from "@/lib/tripsStore";

/**
 * Search for a place and add it to THIS trip, without leaving the trip.
 *
 * Beka 2026-11-08: "როდესაც კონკრეტულ Trip-ზე ვდგავარ, მაქედანვე მქონდეს
 * შესაძლებლობა რომ მოვძებნო ახალი გაიდი და დავამატო. პირდაპირ."
 *
 * Until now the only way in was: leave the trip → search → open or save
 * a place → pick this trip in the sheet → come back. This collapses it
 * to type → tap +.
 *
 * Same two-step search the home screen and /results use, so a query
 * here costs and caches exactly like one typed anywhere else:
 *   1. classifySearchQuery — a single landmark ("Colosseum") comes back
 *      as one result and is added as-is.
 *   2. anything else (a city, a region) — the first page of attractions
 *      from /api/attractions, the same rows /results shows.
 * The slug is built from the English name, matching results.tsx since
 * 2026-11-07, so a place added here and one added from a search card
 * are the same trip item (the insert's unique key catches the repeat).
 *
 * No new strings: every label below already exists in all 52 locales.
 * The + button speaks through its aria-label; the result row shows the
 * name and city.
 *
 * Known limit: a single landmark from step 1 has no coordinates (the
 * classifier doesn't return any), so it joins the trip without a map
 * pin. Places from a city search carry the attraction row's coords.
 */
type Hit = {
  slug: string;
  name: string;
  city: string | null;
  imageUrl: string | null;
  lat: number | null;
  lng: number | null;
};

export function TripPlaceSearch({
  tripId,
  tripName,
  onAdded,
}: {
  tripId: string;
  tripName: string;
  /** Called after a successful insert so the page can reload its items. */
  onAdded: () => void;
}) {
  const t = useT();
  const preferredLanguage = usePreferredLanguage();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<Hit[] | null>(null);
  /** Slugs added during this visit — the + turns into a check. */
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q || busy) return;
    setBusy(true);
    setHits(null);
    try {
      const cls = await classifySearchQuery(q);
      if (cls.kind === "attraction" && cls.name && cls.slug) {
        setHits([
          {
            slug: cls.slug,
            name: cls.name,
            city: cls.city ?? null,
            imageUrl: null,
            lat: null,
            lng: null,
          },
        ]);
        return;
      }
      const language = detectQueryLanguage(q, preferredLanguage);
      const { attractions } = await fetchAttractionsWithMeta(q, language);
      setHits(
        (attractions ?? []).map((a) => ({
          slug: attractionSlug(a.name_en ?? a.name),
          name: a.name,
          city: (typeof a.city === "string" && a.city) || q,
          imageUrl: typeof a.image_url === "string" ? a.image_url : null,
          lat: typeof a.lat === "number" ? a.lat : null,
          lng: typeof a.lng === "number" ? a.lng : null,
        })),
      );
    } catch (err) {
      console.warn("[trip-search] failed", err);
      setHits([]);
    } finally {
      setBusy(false);
    }
  }

  async function add(hit: Hit) {
    if (adding || added.has(hit.slug)) return;
    setAdding(hit.slug);
    void haptic("light");
    try {
      // "already" is a success from the user's point of view: the place
      // IS in this trip. Same toast either way.
      await addPlaceToTrip(tripId, hit);
      setAdded((prev) => new Set(prev).add(hit.slug));
      toast.success(t("trips.addedTo", { name: tripName }));
      onAdded();
    } catch (err) {
      console.warn("[trip-search] add failed", err);
      toast.error(t("trips.addFailed"));
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="mt-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
        {t("trips.findPlaces")}
      </p>

      <form
        onSubmit={runSearch}
        className="mt-2.5 flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-4 pr-1.5"
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("home.searchPlaceholder")}
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-[13.5px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          aria-label={t("home.search")}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-gold text-primary-foreground transition-smooth active:scale-95 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </button>
      </form>

      {busy && (
        <p className="mt-3 text-center text-[12px] text-muted-foreground">
          {t("results.searching")}
        </p>
      )}

      {!busy && hits && hits.length === 0 && (
        <p className="mt-3 text-center text-[12px] text-muted-foreground">{t("results.empty")}</p>
      )}

      {!busy && hits && hits.length > 0 && (
        <ul className="mt-3 overflow-hidden rounded-2xl border border-border bg-card">
          {hits.map((hit) => {
            const done = added.has(hit.slug);
            return (
              <li
                key={hit.slug}
                className="flex items-center gap-3 border-b border-border/60 px-3 py-2.5 last:border-b-0"
              >
                {hit.imageUrl ? (
                  <img
                    src={hit.imageUrl}
                    alt=""
                    loading="lazy"
                    className="h-10 w-10 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted">
                    <Search className="h-4 w-4 text-muted-foreground/60" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-foreground">{hit.name}</p>
                  {hit.city && (
                    <p className="truncate text-[11px] text-muted-foreground">{hit.city}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void add(hit)}
                  disabled={done || adding !== null}
                  aria-label={t("trips.addedTo", { name: tripName })}
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-smooth active:scale-95 ${
                    done
                      ? "border border-primary/40 text-primary"
                      : "bg-gradient-gold text-primary-foreground shadow-glow disabled:opacity-60"
                  }`}
                >
                  {adding === hit.slug ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : done ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
