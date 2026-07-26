import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Luggage, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { MobileFrame } from "@/components/MobileFrame";
import { TripMap } from "@/components/TripMap";
import { useT } from "@/hooks/useT";
import type { TripItem } from "@/lib/tripsStore";
import type { SharedTripPayload } from "./api.trip-share";

/**
 * /t/$shareId — PUBLIC read-only view of a shared trip (Phase 5).
 * No auth, no tab-bar actions — this is the page a friend opens from
 * a link in a group chat. Data comes from /api/trip-share (service
 * role behind RLS; see that route for the sanitisation contract).
 * Closes with a "plan your own" CTA — every shared link doubles as
 * an organic landing page for Lokali.
 *
 * OG tags are static ("A trip plan on Lokali") — the app shell is
 * client-rendered, so per-trip OG would need SSR'd head data; noted
 * as a follow-up if share previews become a growth lever.
 */
export const Route = createFileRoute("/t/$shareId")({
  head: () => ({
    meta: [
      { title: "Trip plan — Lokali" },
      {
        name: "description",
        content: "A hand-picked trip plan on Lokali — places, days, and audio guides.",
      },
      { property: "og:title", content: "Trip plan — Lokali" },
      {
        property: "og:description",
        content: "A hand-picked trip plan on Lokali — open to see the places and days.",
      },
    ],
  }),
  component: SharedTripPage,
});

function SharedTripPage() {
  const { shareId } = Route.useParams();
  const t = useT();
  const [data, setData] = useState<SharedTripPayload | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/trip-share?sid=${encodeURIComponent(shareId)}`)
      .then(async (res) => (res.ok ? ((await res.json()) as SharedTripPayload) : null))
      .catch(() => null)
      .then((payload) => {
        if (!cancelled) setData(payload);
      });
    return () => {
      cancelled = true;
    };
  }, [shareId]);

  // TripMap consumes TripItem[] — adapt the sanitised payload shape
  // (synthetic ids are fine, the map only reads name/lat/lng).
  const mapItems: TripItem[] =
    data?.items.map((i, idx) => ({
      id: `${idx}`,
      trip_id: "",
      attraction_slug: i.slug,
      name: i.name,
      city: i.city,
      image_url: i.image_url,
      lat: i.lat,
      lng: i.lng,
      day_index: i.day_index,
      position: i.position,
      note: null,
    })) ?? [];

  const days = new Map<number, SharedTripPayload["items"]>();
  for (const item of data?.items ?? []) {
    const arr = days.get(item.day_index) ?? [];
    arr.push(item);
    days.set(item.day_index, arr);
  }
  const dayKeys = [...days.keys()].sort((a, b) => a - b);

  return (
    <MobileFrame hideTabBar>
      <div className="relative min-h-full bg-background pb-16 text-foreground">
        {/* Cover */}
        {data?.cover_url && (
          <div
            className="h-44 w-full bg-cover bg-center"
            style={{ backgroundImage: `url('${data.cover_url}')` }}
          >
            <div className="h-full w-full bg-gradient-to-t from-background to-transparent" />
          </div>
        )}

        <section className="px-6 pt-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
            <Luggage className="h-3 w-3" /> {t("trips.sharedTrip")}
          </span>

          {data === undefined && (
            <p className="mt-6 text-[13px] text-muted-foreground">…</p>
          )}
          {data === null && (
            <div className="mt-6 rounded-2xl border border-border bg-card p-6 text-center">
              <p className="text-[14px] font-semibold">{t("trips.shareGone")}</p>
              <p className="mt-2 text-[12px] text-muted-foreground">
                {t("trips.shareGoneDesc")}
              </p>
            </div>
          )}

          {data && (
            <>
              <h1 className="mt-4 font-display text-[2rem] font-medium leading-[1.08]">
                {data.name}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {data.items.length === 1
                    ? t("trips.places.one")
                    : t("trips.places.many").replace("{n}", String(data.items.length))}
                </span>
                {data.start_date && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {data.start_date}
                    {data.end_date && data.end_date !== data.start_date
                      ? ` – ${data.end_date}`
                      : ""}
                  </span>
                )}
              </div>

              {mapItems.length > 0 && <TripMap items={mapItems} />}

              {dayKeys.map((day) => (
                <div key={day} className="mt-6">
                  {(dayKeys.length > 1 || day !== 0) && (
                    <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      {day === 0
                        ? t("trips.anytime")
                        : t("trips.day").replace("{n}", String(day))}
                    </p>
                  )}
                  <ul className="flex flex-col gap-2">
                    {(days.get(day) ?? []).map((item, idx) => (
                      <li
                        key={`${day}-${idx}`}
                        className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
                      >
                        <div
                          className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-gradient-to-br from-primary/20 to-primary/5"
                          style={
                            item.image_url
                              ? {
                                  backgroundImage: `url('${item.image_url}')`,
                                  backgroundSize: "cover",
                                  backgroundPosition: "center",
                                }
                              : undefined
                          }
                        >
                          {!item.image_url && (
                            <MapPin className="h-4 w-4 text-primary/60" />
                          )}
                        </div>
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] font-semibold leading-tight">
                            {item.name}
                          </span>
                          {item.city && (
                            <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
                              {item.city}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {/* Organic-growth CTA — the reason share pages exist. */}
              <div className="mt-10 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 to-transparent p-6 text-center">
                <p className="text-[14px] font-semibold">{t("trips.openInLokali")}</p>
                <Link
                  to="/"
                  className="mt-4 inline-flex items-center justify-center rounded-full bg-gradient-gold px-6 py-2.5 text-[13px] font-bold text-primary-foreground shadow-glow transition-smooth active:scale-95"
                >
                  Lokali →
                </Link>
              </div>
            </>
          )}
        </section>
      </div>
    </MobileFrame>
  );
}
