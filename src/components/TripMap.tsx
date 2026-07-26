import { useEffect, useRef, useState } from "react";
// Leaflet's stylesheet MUST come with the component — without it the
// tile panes render unpositioned and the map looks frozen/blank.
// (Beka 2026-07-26: the trip map was "stuck" — attraction.$id.tsx and
// map.tsx each import this css themselves, TripMap didn't.)
import "leaflet/dist/leaflet.css";
import type { TripItem } from "@/lib/tripsStore";

/**
 * Trip overview map (Trips Phase 2) — all of a trip's places as pins
 * on one Leaflet map, auto-fitted. Sibling of MapSection
 * (attraction.$id.tsx) and reuses its conventions: dynamic leaflet
 * import (keeps the chunk out of the main bundle), divIcon pins in
 * the app's gold styling, dark CartoDB tiles.
 *
 * Items without coordinates are simply skipped — same rule MapSection
 * applies to saved pins. When NO item has coords the component
 * renders nothing (the caller doesn't reserve space for it).
 */
export function TripMap({ items }: { items: TripItem[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);
  const [ready, setReady] = useState(false);

  const pins = items.filter(
    (i) => typeof i.lat === "number" && typeof i.lng === "number",
  );

  useEffect(() => {
    if (pins.length === 0) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      // Tear down a previous instance on item changes — cheaper than
      // diffing markers for a list this small (≤ trip size).
      if (mapRef.current) {
        (mapRef.current as { remove: () => void }).remove();
        mapRef.current = null;
      }

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: true,
      });
      mapRef.current = map;

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {
          attribution: "&copy; OpenStreetMap &copy; CARTO",
          maxZoom: 19,
        },
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

      if (latLngs.length === 1) {
        map.setView(latLngs[0], 14);
      } else {
        map.fitBounds(L.latLngBounds(latLngs), { padding: [36, 36], maxZoom: 15 });
      }
      // The container mounts inside MobileFrame's scroll area, which
      // can still be settling when Leaflet measures itself — re-check
      // the size a beat later, same trick map.tsx uses.
      setTimeout(() => {
        try {
          map.invalidateSize();
        } catch {
          /* map already torn down */
        }
      }, 250);
      setReady(true);
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        (mapRef.current as { remove: () => void }).remove();
        mapRef.current = null;
      }
    };
    // Re-init when the pin set actually changes (ids joined), not on
    // every parent render with an identical list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins.map((p) => p.id).join(",")]);

  if (pins.length === 0) return null;

  return (
    <div
      className={`mt-6 h-56 w-full overflow-hidden rounded-2xl border border-border transition-opacity ${ready ? "opacity-100" : "opacity-0"}`}
      ref={containerRef}
    />
  );
}
