/**
 * Tear a Leaflet map down without leaving a timer pointed at its
 * corpse.
 *
 * ── The crash this fixes ─────────────────────────────────────────
 * Beka 2026-11-01, caught by the new window.onerror logging:
 *
 *   TypeError: Cannot read properties of undefined (reading '_leaflet_pos')
 *     at mt                       (getPosition)
 *     at e._getMapPanePos
 *     at e._getNewPixelOrigin
 *     at e._move
 *     at e._onZoomTransitionEnd
 *
 * Seen on /attraction/metekhi-church and /attraction/süleymaniye-mosque:
 * the user zooms the little map, then leaves the page inside the
 * quarter-second the zoom animation takes.
 *
 * ── Why plain map.remove() is not enough ─────────────────────────
 * This is a bug in Leaflet, not in our teardown. Reading its source
 * (node_modules/leaflet/dist/leaflet-src.js):
 *
 *   4827:  setTimeout(bind(this._onZoomTransitionEnd, this), 250);
 *
 *   4830:  _onZoomTransitionEnd: function () {
 *   4831:      if (!this._animatingZoom) { return; }
 *   4833:      if (this._mapPane) { ... }          // ← guarded
 *   4839:      this._move(...);                    // ← NOT guarded
 *
 * `remove()` detaches `_mapPane` but never clears that 250 ms timer
 * and never resets `_animatingZoom`. So the timer still fires on a
 * destroyed map, sails past the line 4831 guard, and line 4839
 * reaches for a pane that no longer exists. Leaflet even checks
 * `_mapPane` on 4833 and then uses it unchecked four lines later.
 *
 * ── The fix ──────────────────────────────────────────────────────
 * Clear `_animatingZoom` ourselves before removing. The pending
 * callback then hits the early return on 4831 and does nothing.
 *
 * That one line is the WHOLE fix. An earlier draft also called the
 * public `stop()` first, which turned out to be both redundant and
 * risky: `remove()` already calls `_stop()` internally (so pan and
 * flyTo are handled), while `stop()` itself starts with
 * `this.setZoom(this._limitZoom(this._zoom))` — a setView on a map we
 * are in the middle of destroying. Reading the source is what caught
 * that; it would have been a quiet way to make teardown worse.
 *
 * Touching a private field is deliberate and deliberately contained:
 * one function, one documented line, rather than the same `as any`
 * scattered across three components.
 *
 * Safe to call with null/undefined, and never throws — a teardown
 * that throws takes the unmount with it.
 */

/** The private bits of L.Map this teardown has to reach for. */
type DestroyableMap = {
  remove?: () => void;
  _animatingZoom?: boolean;
};

export function destroyLeafletMap(map: unknown): void {
  const m = map as DestroyableMap | null | undefined;
  if (!m) return;
  try {
    // THE line. Makes the orphaned 250 ms zoom-transition callback a
    // no-op instead of a crash. See the header for the Leaflet source
    // line numbers this is working around.
    m._animatingZoom = false;
  } catch {
    /* frozen object — nothing to do */
  }
  try {
    m.remove?.();
  } catch {
    /* Leaflet occasionally throws if the container is already gone;
       the map is unreachable either way, so swallow it. */
  }
}
