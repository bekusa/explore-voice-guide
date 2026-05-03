import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MapPin, Navigation, Bookmark, Layers, Loader2 } from "lucide-react";
import { MobileFrame } from "@/components/MobileFrame";
import { useSavedItems } from "@/hooks/useSavedItems";
import { attractionSlug } from "@/lib/api";
import { useT } from "@/hooks/useT";
import "leaflet/dist/leaflet.css";

export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "Map — Voices of Old Tbilisi" },
      {
        name: "description",
        content: "Explore your saved places on the map. Tap a pin to open its narrated guide.",
      },
      { property: "og:title", content: "Map — Voices of Old Tbilisi" },
      {
        property: "og:description",
        content: "Explore your saved places on an interactive map.",
      },
    ],
  }),
  component: MapPage,
  ssr: false, // Leaflet is browser-only
});

// Tbilisi center as a sensible default
const DEFAULT_CENTER: [number, number] = [41.6938, 44.8015];

type Pin = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category?: string;
};

function MapPage() {
  const saved = useSavedItems();
  const navigate = useNavigate();
  const t = useT();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);
  const markersRef = useRef<unknown[]>([]);
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);
  const [style, setStyle] = useState<"streets" | "dark">("dark");

  const pins = useMemo<Pin[]>(() => {
    return saved
      .filter((s) => typeof s.attraction.lat === "number" && typeof s.attraction.lng === "number")
      .map((s) => ({
        id: s.id,
        name: s.name,
        lat: s.attraction.lat as number,
        lng: s.attraction.lng as number,
        category: s.attraction.category,
      }));
  }, [saved]);

  // Initialize Leaflet map (dynamic import keeps SSR happy)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        center: DEFAULT_CENTER,
        zoom: 13,
        zoomControl: false,
        attributionControl: false,
      });
      L.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);

      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      const map = mapRef.current as { remove?: () => void } | null;
      map?.remove?.();
      mapRef.current = null;
    };
  }, []);

  // Swap tile layer when style changes
  useEffect(() => {
    if (!ready) return;
    let layer: unknown = null;
    (async () => {
      const L = (await import("leaflet")).default;
      const map = mapRef.current as L.Map;
      if (!map) return;
      // Remove previous tiles
      map.eachLayer((l) => {
        if ((l as L.TileLayer).getAttribution) map.removeLayer(l);
      });
      const tiles =
        style === "dark"
          ? L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
              attribution: "© OpenStreetMap · © CARTO",
              maxZoom: 19,
            })
          : L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
              attribution: "© OpenStreetMap",
              maxZoom: 19,
            });
      tiles.addTo(map);
      layer = tiles;
    })();
    return () => {
      const l = layer as { remove?: () => void } | null;
      l?.remove?.();
    };
  }, [ready, style]);

  // Render pins for saved places
  useEffect(() => {
    if (!ready) return;
    (async () => {
      const L = (await import("leaflet")).default;
      const map = mapRef.current as L.Map;
      if (!map) return;

      // Clear previous markers
      markersRef.current.forEach((m) => (m as L.Marker).remove());
      markersRef.current = [];

      pins.forEach((p) => {
        const icon = L.divIcon({
          className: "tg-pin",
          html: `
            <div class="relative flex items-center justify-center">
              <span class="absolute h-8 w-8 rounded-full bg-primary/30 animate-ping"></span>
              <span class="relative grid h-7 w-7 place-items-center rounded-full bg-gradient-gold text-primary-foreground shadow-glow border border-primary-foreground/30">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>
              </span>
            </div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 28],
        });
        const marker = L.marker([p.lat, p.lng], { icon }).addTo(map);
        marker.bindTooltip(p.name, {
          direction: "top",
          offset: [0, -24],
          className: "tg-tooltip",
        });
        marker.on("click", () => {
          navigate({
            to: "/attraction/$id",
            params: { id: attractionSlug(p.name) },
            search: { name: p.name },
          });
        });
        markersRef.current.push(marker);
      });

      // Fit bounds when we have pins
      if (pins.length > 0) {
        const bounds = L.latLngBounds(pins.map((p) => [p.lat, p.lng]));
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
      }
    })();
  }, [ready, pins, navigate]);

  const locate = () => {
    if (!navigator.geolocation || locating) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setMe(coords);
        const L = (await import("leaflet")).default;
        const map = mapRef.current as L.Map;
        if (map) map.setView(coords, 15, { animate: true });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  // Add/update "you are here" marker
  useEffect(() => {
    if (!ready || !me) return;
    let marker: unknown = null;
    (async () => {
      const L = (await import("leaflet")).default;
      const map = mapRef.current as L.Map;
      if (!map) return;
      const icon = L.divIcon({
        className: "tg-me",
        html: `<span class="relative flex h-3 w-3">
            <span class="absolute inline-flex h-full w-full rounded-full bg-accent opacity-60 animate-ping"></span>
            <span class="relative inline-flex h-3 w-3 rounded-full bg-accent border-2 border-background"></span>
          </span>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      marker = L.marker(me, { icon, zIndexOffset: 1000 }).addTo(map);
    })();
    return () => {
      const m = marker as { remove?: () => void } | null;
      m?.remove?.();
    };
  }, [ready, me]);

  return (
    <MobileFrame>
      <div className="relative h-full w-full overflow-hidden bg-background text-foreground">
        {/* Map canvas */}
        <div ref={containerRef} className="absolute inset-0 z-0 bg-secondary" />

        {/* Top bar */}
        <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between px-5 pt-12">
          <Link
            to="/"
            aria-label={t("nav.back")}
            className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full border border-border bg-background/80 text-foreground backdrop-blur-md transition-smooth hover:bg-background"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="pointer-events-auto rounded-full border border-border bg-background/80 px-4 py-2 text-center backdrop-blur-md">
            <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-primary">
              {t("map.title")}
            </div>
            <div className="text-[12px] font-semibold">
              {pins.length === 1
                ? t("map.savedOne", { n: pins.length })
                : t("map.savedMany", { n: pins.length })}
            </div>
          </div>
          <button
            onClick={() => setStyle((s) => (s === "dark" ? "streets" : "dark"))}
            aria-label={t("map.toggleStyle")}
            className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full border border-border bg-background/80 text-foreground backdrop-blur-md transition-smooth hover:bg-background"
          >
            <Layers className="h-4 w-4" />
          </button>
        </header>

        {/* Locate me */}
        <button
          onClick={locate}
          disabled={locating}
          aria-label={t("map.centerLoc")}
          className="absolute right-5 top-[180px] z-20 grid h-11 w-11 place-items-center rounded-full bg-gradient-gold text-primary-foreground shadow-glow transition-smooth hover:scale-105 disabled:opacity-70"
        >
          {locating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Navigation className="h-4 w-4" />
          )}
        </button>

        {/* Empty state overlay */}
        {ready && pins.length === 0 && (
          <div className="pointer-events-none absolute inset-x-5 bottom-28 z-20 rounded-2xl border border-border bg-card/95 p-5 text-center shadow-elegant backdrop-blur-xl">
            <div className="pointer-events-auto mx-auto grid h-12 w-12 place-items-center rounded-full bg-gradient-gold text-primary-foreground shadow-glow">
              <Bookmark className="h-4 w-4" />
            </div>
            <h2 className="mt-3 font-display text-[18px]">
              {t("map.empty")} <span className="italic text-primary">{t("map.emptyYet")}</span>
            </h2>
            <p className="mt-1.5 text-[12px] leading-[1.5] text-muted-foreground">
              {t("map.emptyHelp")}
            </p>
            <Link
              to="/"
              className="pointer-events-auto mt-4 inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-background transition-smooth hover:scale-[1.02]"
            >
              <MapPin className="h-3 w-3" /> {t("map.findCta")}
            </Link>
          </div>
        )}

        {/* Loader */}
        {!ready && (
          <div className="absolute inset-0 z-10 grid place-items-center">
            <div className="flex items-center gap-2 rounded-full border border-border bg-card/80 px-4 py-2 text-[12px] text-muted-foreground backdrop-blur-md">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("map.loading")}
            </div>
          </div>
        )}
      </div>
    </MobileFrame>
  );
}
