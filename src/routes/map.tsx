import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MapPin, Navigation, Bookmark, Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MobileFrame } from "@/components/MobileFrame";
import { useSavedItems } from "@/hooks/useSavedItems";
import { attractionSlug } from "@/lib/api";
import {
  getCurrentLocation,
  getLocationPermissionState,
} from "@/lib/geolocation";
import { useT } from "@/hooks/useT";
import "leaflet/dist/leaflet.css";

export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "Map — Lokali" },
      {
        name: "description",
        content: "Explore your saved places on the map. Tap a pin to open its narrated guide.",
      },
      { property: "og:title", content: "Map — Lokali" },
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
    let ro: ResizeObserver | null = null;
    const invalidateTimers: number[] = [];
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      // Belt and braces — if for some reason the container hasn't
      // sized itself yet at init (h-full collapsing through the
      // overflow-y-auto scroll wrapper, hydration jitter, etc.) the
      // map paints into a 0×0 canvas and the whole tile area stays
      // black. Force a concrete pixel height now using the parent's
      // bounding box. The container has `absolute inset-0` so this
      // should resolve to the phone height, but reading clientHeight
      // and stamping it back closes the gap when getBoundingClientRect
      // reports 0 at mount time.
      const el = containerRef.current;
      const ensureSize = () => {
        if (!el.parentElement) return;
        const r = el.parentElement.getBoundingClientRect();
        if (r.height > 0 && el.clientHeight === 0) {
          el.style.height = `${r.height}px`;
        }
      };
      ensureSize();

      const map = L.map(containerRef.current, {
        center: DEFAULT_CENTER,
        zoom: 13,
        zoomControl: false,
        attributionControl: false,
      });
      L.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);

      mapRef.current = map;
      setReady(true);

      // Leaflet caches the container size at init. If the page mounts
      // before the layout settles (transitions, MobileFrame re-flow,
      // dvh recompute on mobile address-bar collapse, etc.) tiles
      // render at 0x0 and the canvas stays black. We hit this hard on
      // Lovable's Cloudflare Workers preview — the AiGeneratedFooter,
      // the language pill row, and the `overflow-y-auto` scroll wrap
      // each added a measurable layout shift after first paint.
      //
      // Fix is layered:
      //   1. Fire invalidateSize on a cascade of timeouts so we catch
      //      whichever frame the browser actually settles on. Cheap.
      //   2. Hook a ResizeObserver to the container — whenever the
      //      bounding box changes (rotation, dvh shift, parent resize)
      //      Leaflet recomputes. Survives slow paints and stays useful
      //      for the lifetime of the page.
      const invalidate = () => {
        ensureSize();
        map.invalidateSize();
      };
      requestAnimationFrame(invalidate);
      invalidateTimers.push(
        ...[50, 150, 300, 600, 1000, 2000].map((ms) => window.setTimeout(invalidate, ms)),
      );
      if (typeof ResizeObserver !== "undefined" && el) {
        ro = new ResizeObserver(() => invalidate());
        ro.observe(el);
        if (el.parentElement) ro.observe(el.parentElement);
      }
    })();
    return () => {
      cancelled = true;
      invalidateTimers.forEach((t) => window.clearTimeout(t));
      ro?.disconnect();
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

  // Tracks whether we've already shown the pre-permission card this
  // session. Beka asked for a friendly "Lokali needs your location"
  // explainer before the OS dialog — first locate-tap shows the card,
  // subsequent taps go straight to the request. Card state lives in
  // the component (resets on remount) so a fresh map open re-explains
  // for first-time users who switched apps and forgot.
  const [showLocationRationale, setShowLocationRationale] = useState(false);

  const locate = async () => {
    if (locating) return;
    // First-tap pre-permission UX. If the OS has never been asked
    // (state is "prompt" or "prompt-with-rationale" or "unknown"),
    // show our explainer card and let the user dismiss → triggers
    // the real OS dialog. Granted/denied users skip straight to the
    // request (granted = silently fetches; denied = the helper
    // throws LOCATION_DENIED, we toast). Play Store-friendly: we
    // never surprise the user with a cold OS dialog.
    const state = await getLocationPermissionState();
    if (
      (state === "prompt" || state === "prompt-with-rationale" || state === "unknown") &&
      !showLocationRationale
    ) {
      setShowLocationRationale(true);
      return;
    }
    setShowLocationRationale(false);
    setLocating(true);
    try {
      const coords = await getCurrentLocation({ timeoutMs: 8000 });
      const tuple: [number, number] = [coords.lat, coords.lng];
      setMe(tuple);
      const L = (await import("leaflet")).default;
      const map = mapRef.current as L.Map;
      if (map) map.setView(tuple, 15, { animate: true });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "LOCATION_DENIED") {
        toast.error(t("map.locDeniedTitle"), {
          description: t("map.locDeniedDesc"),
        });
      } else if (code === "LOCATION_TIMEOUT") {
        toast.error(t("map.locTimeoutTitle"), {
          description: t("map.locTimeoutDesc"),
        });
      } else {
        toast.error(t("map.locFailedTitle"), {
          description: t("map.locFailedDesc"),
        });
      }
    } finally {
      setLocating(false);
    }
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
    // hideAiFooter: the map page fills the viewport via an absolute
    // canvas, so the fineprint footer was getting stranded below the
    // fold and (per Beka's testing) interacting badly with the scroll
    // container — leaving the tile area black. Opt out so the
    // scroll-area has a single sized child again and the absolute
    // canvas resolves cleanly against it.
    <MobileFrame hideAiFooter>
      {/* Explicit dvh height instead of `h-full`. Reason: the
          MobileFrame wraps children in `overflow-y-auto` and `h-full`
          there has to inherit through the scroll context. On
          Lovable's Cloudflare preview (and iOS Safari at times)
          h-full collapsed to 0 before the first paint, which gave
          Leaflet a 0×0 container and a permanently black canvas. A
          concrete 100dvh removes the inheritance dependency and the
          init-time invalidateSize cascade catches the residual
          jitter from mobile address-bar collapse. */}
      <div className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
        {/* Map canvas. inset-0 + z-0 keeps it underneath the absolute
            header / locate button / empty-state overlay above. */}
        <div ref={containerRef} className="absolute inset-0 z-0 bg-secondary" />

        {/* Top bar — pt-12 lifts the controls below the iOS notch /
            Android status bar; env(safe-area-inset-top) adds the
            real device measurement on top so Pixel 10 Pro punch-
            hole + iPhone Dynamic Island stay clear. */}
        <header
          style={{ paddingTop: "max(4rem, calc(env(safe-area-inset-top) + 1rem))" }}
          className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between px-5"
        >
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

        {/* Pre-permission rationale card. Shown the first time the
            user taps the locate button on a fresh app install (when
            the OS permission is still in "prompt" state). Tells the
            user WHY we need GPS — Play Store reviewers explicitly
            flag cold permission dialogs and the App Store guideline
            5.1.1 effectively requires this. Tap "Allow" → proceed to
            the OS dialog; "Not now" → bail. */}
        {showLocationRationale && (
          <div className="absolute inset-x-5 bottom-28 z-30 rounded-2xl border border-primary/30 bg-card/95 p-5 shadow-elegant backdrop-blur-xl">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-gold text-primary-foreground shadow-glow">
              <Navigation className="h-4 w-4" />
            </div>
            <h2 className="mt-3 font-display text-[18px] leading-tight">
              {t("map.locAskTitle")}
            </h2>
            <p className="mt-1.5 text-[12px] leading-[1.5] text-muted-foreground">
              {t("map.locAskBody")}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowLocationRationale(false)}
                className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-[11px] font-semibold text-muted-foreground transition-smooth hover:text-foreground"
              >
                {t("map.locAskDismiss")}
              </button>
              <button
                onClick={() => {
                  // Same handler; the state flips false above the
                  // permission state-check, so a second tap goes
                  // through to the OS prompt.
                  void locate();
                }}
                className="flex-1 rounded-full bg-gradient-gold px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-primary-foreground shadow-glow transition-smooth hover:scale-[1.02]"
              >
                {t("map.locAskAllow")}
              </button>
            </div>
          </div>
        )}

        {/* Empty state overlay */}
        {ready && pins.length === 0 && !showLocationRationale && (
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
