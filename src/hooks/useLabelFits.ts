import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Tracks whether a label string fits inside a fixed-width container.
 *
 * Beka's brief (2026-06-09): the Save / Download buttons on the
 * attraction page are 64-px wide tiles. English ("Save", "Get") fit
 * happily; Georgian ("ჩამოტვირთე") and German ("herunterladen")
 * overflow the tile and the label spills onto the page. Option F was
 * "icon + label, but auto-collapse to icon-only on overflow".
 *
 * Strategy:
 *   1. Measure the label's natural (un-wrapped) text width via a
 *      hidden probe element with the same font + padding.
 *   2. Compare against the container's clientWidth (the visible
 *      tile box) minus a small safety margin so the text doesn't
 *      touch the border.
 *   3. Return `true` when the label fits, `false` when it doesn't.
 *   4. Re-measure on label change AND on container resize
 *      (ResizeObserver) so orientation changes / dynamic font
 *      scaling keep the decision fresh.
 *
 * Usage:
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   const labelFits = useLabelFits(containerRef, label, { padding: 8 });
 *   return (
 *     <div ref={containerRef} className="w-[64px] …">
 *       <Icon />
 *       {labelFits && <span className="text-[9px] …">{label}</span>}
 *     </div>
 *   );
 */
export function useLabelFits(
  containerRef: React.RefObject<HTMLElement | null>,
  label: string,
  options: {
    /**
     * Horizontal safety margin in pixels so the label doesn't kiss
     * the container border. Default 6 — empirically enough on the
     * 64-px action tiles without making English labels disappear.
     */
    padding?: number;
    /**
     * Font CSS shorthand used by the probe element. Should match
     * the visible label's font for an accurate measurement. Defaults
     * to a compact uppercase variant matching the attraction-page
     * action buttons.
     */
    font?: string;
  } = {},
): boolean {
  const padding = options.padding ?? 6;
  const font = options.font ?? "600 9px / 1.1 system-ui, -apple-system, sans-serif";
  const [fits, setFits] = useState(true);
  const probeRef = useRef<HTMLSpanElement | null>(null);

  // Create / reuse a single hidden probe span attached to <body> so
  // its measurement isn't affected by ancestor flex sizing.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (probeRef.current) return;
    const probe = document.createElement("span");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.whiteSpace = "nowrap";
    probe.style.top = "-9999px";
    probe.style.left = "-9999px";
    probe.style.pointerEvents = "none";
    probe.setAttribute("aria-hidden", "true");
    document.body.appendChild(probe);
    probeRef.current = probe;
    return () => {
      probe.remove();
      probeRef.current = null;
    };
  }, []);

  // Re-measure whenever the label, font, or container size changes.
  // `useLayoutEffect` so the visible label flip happens before paint
  // (no flash of overflow then hide).
  useLayoutEffect(() => {
    const container = containerRef.current;
    const probe = probeRef.current;
    if (!container || !probe) return;
    probe.style.font = font;
    probe.textContent = label;
    const measure = () => {
      const textWidth = probe.getBoundingClientRect().width;
      const containerWidth = container.clientWidth - padding * 2;
      setFits(textWidth <= containerWidth);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, [containerRef, label, font, padding]);

  return fits;
}
