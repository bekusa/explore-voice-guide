import { useT } from "@/hooks/useT";

/**
 * Small badge component shown on attraction cards + the attraction
 * page hero whenever the place matches a UNESCO World Heritage site
 * (see `lib/unesco.isUnescoSite`).
 *
 * Two visual variants:
 *   - "compact" (default): inline pill with a tiny logo + "UNESCO"
 *     label — used on result cards / nearby cards where space is
 *     tight.
 *   - "hero": larger pill with the full "UNESCO World Heritage"
 *     wording — used on the attraction page hero next to the title.
 *
 * The emblem itself is rendered as a minimal inline SVG, public-
 * domain stylization (squared-circle motif). Keeping it inline
 * means no extra network request and the colour follows currentColor
 * so it themes correctly in dark + light modes.
 */
export function UnescoBadge({
  variant = "compact",
  className = "",
}: {
  variant?: "compact" | "hero";
  className?: string;
}) {
  const t = useT();
  const isHero = variant === "hero";

  return (
    <span
      title={t("unesco.title")}
      aria-label={t("unesco.title")}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 text-primary backdrop-blur-md ${
        isHero
          ? "px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
          : "px-2 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.14em]"
      } ${className}`}
    >
      <UnescoMark className={isHero ? "h-3.5 w-3.5" : "h-2.5 w-2.5"} />
      {isHero ? t("unesco.title") : t("unesco.short")}
    </span>
  );
}

/**
 * Minimal stylized UNESCO World Heritage emblem — a square inscribed
 * in a circle, the universal "interdependence between cultural and
 * natural heritage" mark. Drawn from scratch so we don't ship the
 * official artwork; close enough to read at a glance.
 */
function UnescoMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <rect x="5" y="5" width="14" height="14" rx="0.5" />
    </svg>
  );
}
