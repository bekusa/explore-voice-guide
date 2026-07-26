import { useEffect, useRef } from "react";
// Leaflet's stylesheet MUST come with the component — without it the
// tile panes render unpositioned and the map looks frozen/blank.
import "leaflet/dist/leaflet.css";
import type { TripItem } from "@/lib/tripsStore";

/**
 * Trip overview map — all of a trip's places as pins on one Leaflet
 * map, auto-fitted. Sibling of MapSection (attraction.$id.tsx).
 *
 * Beka 2026-07-26 (round 2): the first version rendered a blank box —
 * on-device AND on the live Cloudflare preview the map made ZERO tile
 * requests. Root cause: TripMap sits in MobileFrame's `overflow-y-auto`
 * flow, and Leaflet measured the container while it was still 0-sized,
 * computed "no tiles needed", and the single delayed invalidateSize
 * wasn't enough to recover. The full /map page works because it stamps
 * an explicit pixel height and fires a CASCADE of invalidateSize calls
 * (rAF + several timers + a ResizeObserver). This rewrite copies that
 * proven approach and drops the opacity gate (which hid the map when
 * `ready` never flipped).
 *
 * Items without coordinates are skipped; when none have coords the
 * component renders nothing.
 */
export function TripMap({ items }: { items: TripItem[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);

  const pins = items.filter(
    (i) => typeof i.lat === "number" && typeof i.lng === "number",
  );
  const pinKey = pins.map((p) => `${p.id}:${p.lat},${p.lng}`).join("|");

  useEffect(() => {
    if (pins.length === 0) return;
    let cancelled = false;
    const timers: number[] = [];
    let ro: ResizeObserver | null = null;

    (async () => {
      const L = (await import("leaflet")).default;
      const el = containerRef.current;
      if (cancelled || !el) return;

      // Guarantee a concrete size BEFORE Leaflet measures. The div
      // carries h-56 (224px) via class, but during the mount pass the
      // parent width can still be 0 inside the scroll wrapper — stamp
      // an explicit height and read the parent width so the first tile
      // computation isn't done against a 0×0 box.
      if (el.clientHeight === 0) el.style.height = "224px";

      if (mapRef.current) {
        (mapRef.current as { remove: () => void }).remove();
        mapRef.current = null;
      }

      const map = L.map(el, {
        zoomControl: false,
        attributionControl: true,
      });
      mapRef.current = map;

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        { attribution: "&copy; OpenStreetMap &copy; CARTO", maxZoom: 19 },
      ).addTo(map);

      const icon = L.divIcon({
        className: "tg-pin-saved",
        html: `
          <div class="relative flex items-center justify-center">
            <span class="relative grid h-7 w-7 place-items-center rounded-full bg-gradient-gold text-primary-foreground border-2 border-primary-foreground/40 shadow-glow">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>
            </span>
          </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 26],
      });

      const latLngs: [number, number][] = [];
      for (const item of pins) {
        const ll: [number, number] = [item.lat as number, item.lng as number];
        latLngs.push(ll);
        L.marker(ll, { icon })
          .addTo(map)
          .bindTooltip(item.name, {
            direction: "top",
            offset: [0, -24],
            className: "tg-tooltip",
          });
      }

      const fit = () => {
        if (latLngs.length === 1) {
          map.setView(latLngs[0], 14);
        } else {
          map.fitBounds(L.latLngBounds(latLngs), { padding: [36, 36], maxZoom: 15 });
        }
      };
      fit();

      // Cascade of size re-checks — catches the container settling as
      // MobileFrame's scroll layout, transitions, and mobile
      // address-bar collapse resolve. Each invalidateSize re-fits so
      // the pins stay framed. Mirrors map.tsx.
      const bump = () => {
        try {
          map.invalidateSize();
          fit();
        } catch {
          /* torn down */
        }
      };
      requestAnimationFrame(bump);
      for (const ms of [100, 300, 600, 1000]) {
        timers.push(window.setTimeout(bump, ms));
      }
      // Keep it correct through later layout changes (images loading
      // above the map, keyboard, orientation).
      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(() => bump());
        ro.observe(el);
      }
    })();

    return () => {
      cancelled = true;
      timers.forEach((t) => clearTimeout(t));
      ro?.disconnect();
      if (mapRef.current) {
        (mapRef.current as { remove: () => void }).remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinKey]);

  if (pins.length === 0) return null;

  return (
    <div
      ref={containerRef}
      style={{ height: 224 }}
      className="mt-6 w-full overflow-hidden rounded-2xl border border-border bg-secondary"
    />
  );
}
