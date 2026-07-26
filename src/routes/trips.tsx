import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarDays,
  Luggage,
  MapPin,
  Plus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { MobileFrame } from "@/components/MobileFrame";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/hooks/useT";
import { haptic } from "@/lib/haptics";
import { createTrip, listTrips, type Trip } from "@/lib/tripsStore";

/**
 * /trips — Trips home (Phase 1 of Beka's spec, 2026-07-25).
 * List of the signed-in user's trips + inline create form. Signed-out
 * users get a sign-in card (Trips is account-only by design — see
 * tripsStore.ts header). Tapping a trip opens /trip/$id.
 */
export const Route = createFileRoute("/trips")({
  head: () => ({
    meta: [
      { title: "Trips — Lokali" },
      {
        name: "description",
        content: "Plan journeys: group saved places into trips with day-by-day plans.",
      },
      { property: "og:title", content: "Trips — Lokali" },
    ],
  }),
  component: TripsPage,
});

function TripsPage() {
  const t = useT();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const refresh = useCallback(async () => {
    setLoadError(false);
    try {
      setTrips(await listTrips());
    } catch (err) {
      console.warn("[trips] load failed", err);
      setLoadError(true);
      setTrips(null);
    }
  }, []);

  useEffect(() => {
    if (user) void refresh();
  }, [user, refresh]);

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    void haptic("medium");
    try {
      const trip = await createTrip({
        name: trimmed,
        startDate: startDate || null,
        endDate: endDate || null,
      });
      setName("");
      setStartDate("");
      setEndDate("");
      setShowForm(false);
      // Land straight in the new trip — the empty state there tells
      // the user how to add places, which is the natural next step.
      void navigate({ to: "/trip/$id", params: { id: trip.id } });
    } catch (err) {
      console.warn("[trips] create failed", err);
      setLoadError(true);
    } finally {
      setCreating(false);
    }
  }

  return (
    <MobileFrame>
      <div className="relative min-h-full bg-background pb-32 text-foreground">
        <header className="relative z-10 flex items-center justify-between px-6 pt-safe">
          <Link
            to="/"
            aria-label={t("nav.back")}
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card transition-smooth hover:border-primary/40"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          {user && trips !== null && (
            <button
              onClick={() => {
                void haptic("light");
                setShowForm((v) => !v);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-primary transition-smooth hover:bg-primary/20"
            >
              {showForm ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
              {showForm ? t("trips.cancel") : t("trips.new")}
            </button>
          )}
        </header>

        <section className="px-6 pt-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-primary backdrop-blur-md">
            <Luggage className="h-3 w-3" /> {t("trips.badge")}
          </span>
          <h1 className="mt-4 font-display text-[2.25rem] font-medium leading-[1.05]">
            {t("trips.title1")}{" "}
            <span className="italic text-primary">{t("trips.title2")}</span>
          </h1>
          <p className="mt-3 max-w-[320px] text-[13px] leading-[1.55] text-muted-foreground">
            {t("trips.sub")}
          </p>

          {/* Signed-out — account-only feature, explain why + CTA. */}
          {!user && (
            <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-center">
              <Luggage className="mx-auto h-8 w-8 text-primary" />
              <p className="mt-3 text-[15px] font-semibold">{t("trips.signInTitle")}</p>
              <p className="mx-auto mt-2 max-w-[260px] text-[12.5px] leading-[1.5] text-muted-foreground">
                {t("trips.signInDesc")}
              </p>
              <Link
                to="/auth"
                className="mt-5 inline-flex items-center justify-center rounded-full bg-gradient-gold px-6 py-2.5 text-[13px] font-bold text-primary-foreground shadow-glow transition-smooth active:scale-95"
              >
                {t("nav.signIn")}
              </Link>
            </div>
          )}

          {/* Create form — inline, appears under the header. */}
          {user && showForm && (
            <form
              onSubmit={submitCreate}
              className="mt-6 rounded-2xl border border-primary/25 bg-card p-4"
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("trips.namePh")}
                maxLength={120}
                autoFocus
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[14px] text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none"
              />
              <div className="mt-3 flex gap-3">
                <label className="flex-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {t("trips.start")}
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] font-normal normal-case tracking-normal text-foreground focus:border-primary/50 focus:outline-none"
                  />
                </label>
                <label className="flex-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {t("trips.end")}
                  <input
                    type="date"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] font-normal normal-case tracking-normal text-foreground focus:border-primary/50 focus:outline-none"
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={!name.trim() || creating}
                className="mt-4 w-full rounded-full bg-gradient-gold px-6 py-3 text-[13px] font-bold text-primary-foreground shadow-glow transition-smooth active:scale-95 disabled:opacity-50"
              >
                {creating ? t("trips.creating") : t("trips.create")}
              </button>
            </form>
          )}

          {/* Load error — no silent empty state (see tripsStore note). */}
          {user && loadError && (
            <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-center">
              <p className="text-[13px] text-muted-foreground">{t("trips.loadFailed")}</p>
              <button
                onClick={() => void refresh()}
                className="mt-4 inline-flex items-center justify-center rounded-full border border-primary/40 px-5 py-2 text-[12px] font-bold text-primary transition-smooth hover:bg-primary/10"
              >
                {t("trips.retry")}
              </button>
            </div>
          )}

          {/* Empty state */}
          {user && !loadError && trips !== null && trips.length === 0 && !showForm && (
            <div className="mt-8 rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
              <Luggage className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-3 text-[15px] font-semibold">{t("trips.empty")}</p>
              <p className="mx-auto mt-2 max-w-[260px] text-[12.5px] leading-[1.5] text-muted-foreground">
                {t("trips.emptyDesc")}
              </p>
              <button
                onClick={() => setShowForm(true)}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-gold px-6 py-2.5 text-[13px] font-bold text-primary-foreground shadow-glow transition-smooth active:scale-95"
              >
                <Plus className="h-4 w-4" /> {t("trips.new")}
              </button>
            </div>
          )}

          {/* Trip cards */}
          {user && trips !== null && trips.length > 0 && (
            <ul className="mt-7 flex flex-col gap-3">
              {trips.map((trip) => (
                <li key={trip.id}>
                  <Link
                    to="/trip/$id"
                    params={{ id: trip.id }}
                    onClick={() => void haptic("light")}
                    className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-smooth hover:border-primary/40 active:scale-[0.99]"
                  >
                    {/* Cover: Phase 2 fills cover_url from the first
                        item's photo; until then a warm placeholder. */}
                    <div
                      className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-gradient-to-br from-primary/25 to-primary/5"
                      style={
                        trip.cover_url
                          ? {
                              backgroundImage: `url('${trip.cover_url}')`,
                              backgroundSize: "cover",
                              backgroundPosition: "center",
                            }
                          : undefined
                      }
                    >
                      {!trip.cover_url && <Luggage className="h-5 w-5 text-primary/70" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold leading-tight">
                        {trip.name}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {trip.itemCount === 1
                            ? t("trips.places.one")
                            : t("trips.places.many").replace("{n}", String(trip.itemCount))}
                        </span>
                        {trip.start_date && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {formatRange(trip.start_date, trip.end_date)}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </MobileFrame>
  );
}

/**
 * "12–18 Sep 2026" style compact range. Dates come from Postgres as
 * YYYY-MM-DD; toLocaleDateString handles locale-appropriate month
 * names for free, so this needs no i18n keys.
 */
function formatRange(start: string, end: string | null): string {
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => {
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, opts);
  };
  const full: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  if (!end || end === start) return fmt(start, full);
  return `${fmt(start, { day: "numeric", month: "short" })} – ${fmt(end, full)}`;
}
